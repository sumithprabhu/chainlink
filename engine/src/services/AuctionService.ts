/**
 * Auction service: bid submission and auction close.
 * No plaintext bid stored. Only commitment on chain. Single close per workflow.
 * Contract is final authority for auction validity; engine pre-validates for UX only.
 *
 * Confidential bid amounts must be fully collateralized.
 * Escrow >= confidentialBidAmount enforced before submission and before settlement.
 * Contract only releases escrowed funds; no post-settlement payments.
 */
import { keccak256, solidityPacked } from "ethers";
import type { Logger } from "pino";
import type { BlockchainAdapter } from "../adapters/BlockchainAdapter";
import type { AttestationService } from "./AttestationService";
import type { SettlementService } from "./SettlementService";
import type { CraConfig } from "../../cra/config/craConfig";
import type { SecretProvider } from "../../cra/secretProvider/SecretProvider";
import {
  callAuctionCraSubmitBid,
  callAuctionCraSettle,
  computeWinnerHash,
} from "../api/auctionCraClient";
import { normalizeHex } from "../utils/hex";
import { ModuleType, SettlementMode } from "../types/workflow";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface AuctionServiceConfig {
  blockchain: BlockchainAdapter;
  attestation: AttestationService;
  settlement: SettlementService;
  craConfig: CraConfig;
  secretProvider: SecretProvider;
  maxRetries: number;
  minConfirmations: number;
  logger: Logger;
}

export class AuctionService {
  private readonly blockchain: BlockchainAdapter;
  private readonly attestation: AttestationService;
  private readonly settlement: SettlementService;
  private readonly craConfig: CraConfig;
  private readonly secretProvider: SecretProvider;
  private readonly maxRetries: number;
  private readonly minConfirmations: number;
  private readonly logger: Logger;
  private readonly finalizedWorkflowIds = new Set<string>();

  constructor(config: AuctionServiceConfig) {
    this.blockchain = config.blockchain;
    this.attestation = config.attestation;
    this.settlement = config.settlement;
    this.craConfig = config.craConfig;
    this.secretProvider = config.secretProvider;
    this.maxRetries = config.maxRetries;
    this.minConfirmations = config.minConfirmations;
    this.logger = config.logger.child({ service: "AuctionService" });
  }

  async submitBid(
    workflowId: number,
    bidAmountWei: bigint,
    confidentialBidAmount: string,
    bidderAddress: string
  ): Promise<void> {
    const wid = BigInt(workflowId);
    const config = await this.blockchain.getWorkflowConfig(wid);
    if (!config.active) {
      throw new Error("Workflow not active");
    }
    if (config.moduleType !== ModuleType.SEALED_BID_AUCTION) {
      throw new Error("Workflow is not a sealed-bid auction");
    }
    const executionCount = await this.blockchain.getExecutionCount(wid);
    if (executionCount > 0n) {
      const record = await this.blockchain.getExecutionRecord(wid, 0n);
      if (record.finalized) {
        throw new Error("Auction already finalized");
      }
    }
    if (this.finalizedWorkflowIds.has(String(workflowId))) {
      throw new Error("Auction already closed");
    }
    if (bidAmountWei <= 0n) {
      throw new Error("Escrow amount must be positive");
    }
    const engineAddress = this.blockchain.getWalletAddress();
    if (bidderAddress.toLowerCase() === engineAddress) {
      const tx = await this.blockchain.depositBid(wid, bidAmountWei);
      await this.blockchain.waitForTransaction(tx, this.minConfirmations);
    } else {
      const escrowed = await this.blockchain.getEscrowedBid(wid, bidderAddress);
      if (escrowed < bidAmountWei) {
        throw new Error(
          `Insufficient escrow: bidder must have deposited at least ${bidAmountWei.toString()} wei`
        );
      }
    }
    const escrow = await this.blockchain.getEscrowedBid(wid, bidderAddress);
    const confidentialAmountWei = BigInt(confidentialBidAmount);
    if (escrow < confidentialAmountWei) {
      throw new Error("Escrow must be >= confidentialBidAmount (fully collateralized bid required)");
    }
    this.logger.info({ workflowId, bidderAddress }, "Bid submitted");
    await callAuctionCraSubmitBid(this.craConfig, this.secretProvider, {
      action: "submitBid",
      workflowId,
      confidentialBidAmount,
      bidderAddress,
    });
  }

  async closeAuction(
    workflowId: number,
    options?: { winnerAddress?: string }
  ): Promise<{ commitmentHash: string }> {
    const wid = BigInt(workflowId);
    const key = String(workflowId);
    if (this.finalizedWorkflowIds.has(key)) {
      throw new Error("Auction already closed (single close enforced)");
    }
    const config = await this.blockchain.getWorkflowConfig(wid);
    if (!config.active) {
      throw new Error("Workflow not active");
    }
    if (config.moduleType !== ModuleType.SEALED_BID_AUCTION) {
      throw new Error("Workflow is not a sealed-bid auction");
    }
    const bidderCount = await this.blockchain.getBidderCount(wid);
    if (bidderCount === 0n) {
      throw new Error("Cannot close auction: no bidders");
    }
    // Contract is final authority for auction validity (endTime); winner from CRA, contract enforces payout only.
    const executionCount = await this.blockchain.getExecutionCount(wid);
    if (executionCount > 0n) {
      const record = await this.blockchain.getExecutionRecord(wid, 0n);
      if (record.finalized) {
        throw new Error("Auction already finalized on-chain");
      }
    }

    const result = await callAuctionCraSettle(this.craConfig, this.secretProvider, {
      action: "settleAuction",
      workflowId,
    });

    const isStub =
      process.env.AUCTION_CRA_STUB === "true" || process.env.AUCTION_CRA_STUB === "1";
    const winner =
      (isStub && options?.winnerAddress) ? options.winnerAddress : result.winnerAddress;
    const winnerHashHex = normalizeHex(result.winnerHash);
    const expectedWinnerHash = computeWinnerHash(workflowId, winner);
    if (normalizeHex(expectedWinnerHash) !== winnerHashHex) {
      throw new Error("Winner authenticity failed: winnerHash does not match workflowId and winnerAddress");
    }

    const nonce = executionCount;
    const encHex = normalizeHex(result.encryptedData);
    const nonceHex = normalizeHex(result.nonce);
    const tagHex = normalizeHex(result.tag);
    const commitmentHash = normalizeHex(
      keccak256(
        solidityPacked(
          ["uint256", "bytes", "bytes12", "bytes16", "bytes32"],
          [wid, encHex, nonceHex, tagHex, winnerHashHex]
        )
      )
    );

    const proof = this.attestation.generate(
      config.approvedWorkflowHash,
      commitmentHash,
      nonce
    );
    if (!this.attestation.validateStructure(proof)) {
      throw new Error("Attestation structure validation failed");
    }

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const tx = await this.blockchain.finalizeExecution(wid, commitmentHash, proof, nonce);
        await this.blockchain.waitForTransaction(tx, this.minConfirmations);
        this.finalizedWorkflowIds.add(key);
        this.settlement.handleSettlementMode(wid, config.settlementMode);
        if (config.settlementMode === SettlementMode.ESCROW) {
          if (!winner || winner === "0x0000000000000000000000000000000000000000") {
            throw new Error("Invalid winner: zero address");
          }
          const winnerEscrow = await this.blockchain.getEscrowedBid(wid, winner);
          if (winnerEscrow === 0n) {
            throw new Error("Winner must have escrowed balance > 0");
          }
          const winnerConfidentialWei = BigInt(result.confidentialBidAmount);
          if (winnerEscrow < winnerConfidentialWei) {
            throw new Error("Winner escrow below confidential bid — invalid settlement");
          }
          await this.releaseEscrowWithRetry(wid, winner);
        }
        this.logger.info(
          { workflowId: key, commitmentHash, txHash: tx.hash },
          "Auction closed; finalizeExecution confirmed"
        );
        return { commitmentHash };
      } catch (err) {
        lastErr = err;
        this.logger.warn({ attempt, error: String(err) }, "finalizeExecution attempt failed");
        if (attempt < this.maxRetries) await delay(500 * Math.pow(2, attempt));
      }
    }
    throw lastErr;
  }

  private async releaseEscrowWithRetry(workflowId: bigint, winner: string): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const tx = await this.blockchain.releaseEscrow(workflowId, winner);
        await this.blockchain.waitForTransaction(tx, this.minConfirmations);
        this.logger.info(
          { workflowId: workflowId.toString(), winner, txHash: tx.hash },
          "releaseEscrow confirmed"
        );
        return;
      } catch (err) {
        lastErr = err;
        this.logger.warn({ attempt, error: String(err) }, "releaseEscrow attempt failed");
        if (attempt < this.maxRetries) await delay(500 * Math.pow(2, attempt));
      }
    }
    throw lastErr;
  }
}
