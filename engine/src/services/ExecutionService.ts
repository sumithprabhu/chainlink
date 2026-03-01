/**
 * This service implements the Execution Layer as defined in the architecture diagram.
 * It does not decrypt confidential data and does not alter settlement logic.
 * It only orchestrates confidential execution and attested finalization.
 */
import { keccak256, solidityPacked, toUtf8Bytes } from "ethers";
import type { Logger } from "pino";
import type { BlockchainAdapter } from "../adapters/BlockchainAdapter";
import type { AttestationService } from "./AttestationService";
import type { SettlementService } from "./SettlementService";
import type { CraConfig } from "../../cra/config/craConfig";
import type { SecretProvider } from "../../cra/secretProvider/SecretProvider";
import { runConfidentialHttpWorkflow } from "../../cra/workflow/confidentialHttpWorkflow";
import { normalizeHex } from "../utils/hex";

export enum ExecutionStatus {
  QUEUED = "QUEUED",
  VALIDATING = "VALIDATING",
  EXECUTING_MODULE = "EXECUTING_MODULE",
  BUILDING_ATTESTATION = "BUILDING_ATTESTATION",
  ESTIMATING_GAS = "ESTIMATING_GAS",
  SUBMITTING_TX = "SUBMITTING_TX",
  CONFIRMED = "CONFIRMED",
  FAILED = "FAILED",
}

export interface ExecutionServiceConfig {
  blockchain: BlockchainAdapter;
  attestation: AttestationService;
  settlement: SettlementService;
  craConfig: CraConfig;
  secretProvider: SecretProvider;
  creatorAllowlist: string[];
  executionTimeoutMs: number;
  maxRetries: number;
  minConfirmations: number;
  logger: Logger;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function timeout<T>(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Execution timeout after ${ms}ms`)), ms)
  );
}

export class ExecutionService {
  private readonly blockchain: BlockchainAdapter;
  private readonly attestation: AttestationService;
  private readonly settlement: SettlementService;
  private readonly craConfig: CraConfig;
  private readonly secretProvider: SecretProvider;
  private readonly creatorAllowlist: string[];
  private readonly executionTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly minConfirmations: number;
  private readonly logger: Logger;

  constructor(config: ExecutionServiceConfig) {
    this.blockchain = config.blockchain;
    this.attestation = config.attestation;
    this.settlement = config.settlement;
    this.craConfig = config.craConfig;
    this.secretProvider = config.secretProvider;
    this.creatorAllowlist = config.creatorAllowlist;
    this.executionTimeoutMs = config.executionTimeoutMs;
    this.maxRetries = config.maxRetries;
    this.minConfirmations = config.minConfirmations;
    this.logger = config.logger.child({ service: "ExecutionService" });
  }

  async run(workflowId: bigint, transactionHash: string): Promise<void> {
    const log = this.logger.child({ workflowId: workflowId.toString() });

    const logState = (status: ExecutionStatus, extra?: Record<string, unknown>) => {
      log.info({ status, ...extra }, "Execution lifecycle");
    };

    try {
      logState(ExecutionStatus.QUEUED);

      if (this.creatorAllowlist.length > 0) {
        logState(ExecutionStatus.VALIDATING);
        const creator = await this.blockchain.getTransactionCreator(transactionHash);
        if (!this.creatorAllowlist.includes(creator)) {
          log.warn({ workflowId: workflowId.toString(), status: ExecutionStatus.VALIDATING }, "Creator not in allowlist; skipping");
          return;
        }
      }

      const executionCount = await this.blockchain.getExecutionCount(workflowId);
      if (executionCount > 0n) {
        const record = await this.blockchain.getExecutionRecord(workflowId, 0n);
        if (record.finalized) {
          log.info("Idempotency: workflow already has finalized execution; skipping");
          return;
        }
        const prevRecord = await this.blockchain.getExecutionRecord(workflowId, executionCount - 1n);
        if (!prevRecord.finalized) {
          log.warn("Nonce sequencing integrity: previous execution slot not finalized; aborting");
          throw new Error("Nonce sequencing integrity violation");
        }
      }
      const nonce = executionCount;

      const config = await this.blockchain.getWorkflowConfig(workflowId);
      if (!config.active) {
        log.warn("Workflow is not active; skipping");
        return;
      }

      this.settlement.handleSettlementMode(workflowId, config.settlementMode);

      logState(ExecutionStatus.EXECUTING_MODULE);
      const inputHash = keccak256(
        toUtf8Bytes(`${workflowId.toString()}-${config.approvedWorkflowHash}`)
      );
      let encrypted: { encryptedData: string; nonce: string; tag: string };
      try {
        encrypted = await Promise.race([
          runConfidentialHttpWorkflow(this.craConfig, this.secretProvider, {
            workflowId: workflowId.toString(),
            inputHash,
          }),
          timeout(this.executionTimeoutMs),
        ]);
      } catch (timeoutErr) {
        logState(ExecutionStatus.FAILED, { error: String(timeoutErr) });
        throw timeoutErr;
      }
      const encHex = normalizeHex(encrypted.encryptedData);
      const nonceHex = normalizeHex(encrypted.nonce);
      const tagHex = normalizeHex(encrypted.tag);
      const commitmentHash = normalizeHex(
        keccak256(
          solidityPacked(
            ["uint256", "bytes", "bytes12", "bytes16"],
            [workflowId, encHex, nonceHex, tagHex]
          )
        )
      );

      logState(ExecutionStatus.BUILDING_ATTESTATION);
      const proof = this.attestation.generate(
        config.approvedWorkflowHash,
        commitmentHash,
        nonce
      );
      if (!this.attestation.validateStructure(proof)) {
        throw new Error("Attestation structure validation failed");
      }

      const configBeforeFinalize = await this.blockchain.getWorkflowConfig(workflowId);
      if (configBeforeFinalize.approvedWorkflowHash !== config.approvedWorkflowHash) {
        throw new Error("Execution integrity: approvedWorkflowHash changed");
      }
      if (configBeforeFinalize.moduleType !== config.moduleType) {
        throw new Error("Execution integrity: moduleType changed");
      }
      if (!configBeforeFinalize.active) {
        throw new Error("Execution integrity: workflow no longer active");
      }

      logState(ExecutionStatus.ESTIMATING_GAS);
      try {
        await this.blockchain.estimateGasFinalizeExecution(
          workflowId,
          commitmentHash,
          proof,
          nonce
        );
      } catch (gasErr) {
        log.error({ error: String(gasErr) }, "Gas estimation failed; aborting without sending tx");
        logState(ExecutionStatus.FAILED, { error: String(gasErr) });
        throw gasErr;
      }

      let lastError: unknown;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        logState(ExecutionStatus.SUBMITTING_TX, { attempt });
        try {
          const tx = await this.blockchain.finalizeExecution(
            workflowId,
            commitmentHash,
            proof,
            nonce
          );
          await this.blockchain.waitForTransaction(tx, this.minConfirmations);
          logState(ExecutionStatus.CONFIRMED, { txHash: tx.hash, attempt });
          log.info(
            { workflowId: workflowId.toString(), status: ExecutionStatus.CONFIRMED, txHash: tx.hash, commitmentHash },
            "Execution finalized on-chain"
          );
          return;
        } catch (err) {
          lastError = err;
          log.warn({ attempt, error: String(err) }, "finalizeExecution attempt failed");
          if (attempt < this.maxRetries) {
            const backoffMs = 500 * Math.pow(2, attempt);
            await delay(backoffMs);
          }
        }
      }

      logState(ExecutionStatus.FAILED, {
        attempt: this.maxRetries,
        error: lastError != null ? String(lastError) : undefined,
      });
      throw lastError;
    } catch (err) {
      log.error({ workflowId: workflowId.toString(), status: ExecutionStatus.FAILED, error: String(err) }, "Execution failed");
      logState(ExecutionStatus.FAILED, { error: err != null ? String(err) : undefined });
      throw err;
    }
  }

}
