import { expect } from "chai";
import { ethers } from "hardhat";
import type { ConfidentialExecutionEngine } from "../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ConfidentialExecutionEngine", function () {
  let engine: ConfidentialExecutionEngine;
  let owner: SignerWithAddress;

  const APPROVED_HASH = ethers.keccak256(ethers.toUtf8Bytes("approved-workflow-v1"));
  const COMMITMENT = ethers.keccak256(ethers.toUtf8Bytes("execution-commitment-1"));

  /** Legacy auction config: startTime 0 = no restrictions. */
  const LEGACY_AUCTION_CONFIG = {
    startTime: 0n,
    endTime: 0n,
    minBidIncrement: 0n,
    reservePrice: 0n,
    maxBidders: 0n,
    softCloseEnabled: false,
    softCloseWindow: 0n,
    softCloseExtension: 0n,
  };

  /** Stub proof layout: workflowHash (32) | commitmentHash (32) | nonce (32) = 96 bytes. */
  function stubAttestation(workflowHash: string, commitment: string, nonce: bigint): string {
    const nonceBytes = ethers.zeroPadValue(ethers.toBeHex(nonce), 32);
    return ethers.hexlify(ethers.concat([workflowHash, commitment, nonceBytes]));
  }

  const CREATION_DEPOSIT = ethers.parseEther("0.001");

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ConfidentialExecutionEngine");
    engine = await Factory.deploy(owner.address, owner.address);
  });

  describe("Workflow creation", function () {
    it("should revert if creation deposit is wrong", async function () {
      await expect(
        engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: 0n })
      ).to.be.revertedWithCustomError(engine, "WrongCreationDeposit");
      await expect(
        engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, {
          value: ethers.parseEther("0.002"),
        })
      ).to.be.revertedWithCustomError(engine, "WrongCreationDeposit");
    });

    it("should create workflow and emit WorkflowCreated", async function () {
      await expect(
        engine.createWorkflow(
          APPROVED_HASH,
          0, // SEALED_BID_AUCTION
          0, // ESCROW
          0, // auctionEndTime
          LEGACY_AUCTION_CONFIG,
          { value: CREATION_DEPOSIT }
        )
      )
        .to.emit(engine, "WorkflowCreated")
        .withArgs(1n, APPROVED_HASH, 0, 0);
    });

    it("should store workflow config", async function () {
      await engine.createWorkflow(APPROVED_HASH, 1, 1, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT }); // PRIVATE_VOTING, PRIVATE_SETTLEMENT
      const config = await engine.getWorkflowConfig(1);
      expect(config.approvedWorkflowHash).to.equal(APPROVED_HASH);
      expect(config.moduleType).to.equal(1);
      expect(config.settlementMode).to.equal(1);
      expect(config.active).to.be.true;
    });

    it("should increment nextWorkflowId", async function () {
      expect(await engine.nextWorkflowId()).to.equal(1n);
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      expect(await engine.nextWorkflowId()).to.equal(2n);
    });
  });

  describe("Settlement mode storage", function () {
    it("should store ESCROW", async function () {
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      const config = await engine.getWorkflowConfig(1);
      expect(config.settlementMode).to.equal(0);
    });

    it("should store PRIVATE_SETTLEMENT", async function () {
      await engine.createWorkflow(APPROVED_HASH, 1, 1, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      const config = await engine.getWorkflowConfig(1);
      expect(config.settlementMode).to.equal(1);
    });
  });

  describe("Commitment storage", function () {
    it("should store only commitment hash on finalize", async function () {
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      await engine.finalizeExecution(1, COMMITMENT, stubAttestation(APPROVED_HASH, COMMITMENT, 0n), 0);
      const record = await engine.getExecutionRecord(1, 0);
      expect(record.commitmentHash).to.equal(COMMITMENT);
      expect(record.finalized).to.be.true;
    });

    it("should emit ExecutionFinalized", async function () {
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      await expect(engine.finalizeExecution(1, COMMITMENT, stubAttestation(APPROVED_HASH, COMMITMENT, 0n), 0))
        .to.emit(engine, "ExecutionFinalized")
        .withArgs(1n, 0n, COMMITMENT);
    });

    it("should emit CommitmentVerified", async function () {
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      await expect(engine.finalizeExecution(1, COMMITMENT, stubAttestation(APPROVED_HASH, COMMITMENT, 0n), 0))
        .to.emit(engine, "CommitmentVerified")
        .withArgs(1n, COMMITMENT);
    });
  });

  describe("Replay protection", function () {
    it("should reject reused nonce", async function () {
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      await engine.finalizeExecution(1, COMMITMENT, stubAttestation(APPROVED_HASH, COMMITMENT, 42n), 42);
      await expect(
        engine.finalizeExecution(
          1,
          ethers.keccak256(ethers.toUtf8Bytes("other")),
          stubAttestation(APPROVED_HASH, COMMITMENT, 42n),
          42
        )
      ).to.be.revertedWithCustomError(engine, "NonceAlreadyUsed");
    });

    it("should reject empty attestation", async function () {
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      await expect(engine.finalizeExecution(1, COMMITMENT, "0x", 0)).to.be.revertedWithCustomError(
        engine,
        "InvalidAttestation"
      );
    });

    it("should reject same proof with different nonce (proof bound to nonce)", async function () {
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      const proofForNonce0 = stubAttestation(APPROVED_HASH, COMMITMENT, 0n);
      await engine.finalizeExecution(1, COMMITMENT, proofForNonce0, 0);
      await expect(engine.finalizeExecution(1, COMMITMENT, proofForNonce0, 1)).to.be.revertedWithCustomError(
        engine,
        "InvalidAttestation"
      );
    });
  });

  describe("Attestation and settlement", function () {
    it("should reject finalize with wrong workflow hash (proof for other workflow)", async function () {
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("workflow-1"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("workflow-2"));
      await engine.createWorkflow(hash1, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      await engine.createWorkflow(hash2, 1, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      const proofForWorkflow1 = stubAttestation(hash1, COMMITMENT, 0n);
      await expect(engine.finalizeExecution(2, COMMITMENT, proofForWorkflow1, 0)).to.be.revertedWithCustomError(
        engine,
        "InvalidAttestation"
      );
    });

    it("should reject value when settlement mode is ESCROW", async function () {
      await engine.createWorkflow(APPROVED_HASH, 0, 0, 0, LEGACY_AUCTION_CONFIG, { value: CREATION_DEPOSIT });
      await expect(
        engine.finalizeExecution(1, COMMITMENT, stubAttestation(APPROVED_HASH, COMMITMENT, 0n), 0, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(engine, "EscrowNoValue");
    });
  });
});
