import { keccak256, getBytes, concat, toUtf8Bytes } from "ethers";
import type { Logger } from "pino";
import type { BlockchainAdapter } from "../adapters/BlockchainAdapter";
import type { AttestationService } from "./AttestationService";
import type { SettlementService } from "./SettlementService";
import type { WorkflowConfig } from "../types/workflow";
import type { CraConfig } from "../../cra/config/craConfig";
import { runConfidentialHttpWorkflow } from "../../cra/workflow/confidentialHttpWorkflow";

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
          log.warn({ creator, allowlist: this.creatorAllowlist }, "Creator not in allowlist; skipping");
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
      const encrypted = await Promise.race([
        runConfidentialHttpWorkflow(this.craConfig, {
          workflowId: workflowId.toString(),
          inputHash,
        }),
        timeout(this.executionTimeoutMs),
      ]);
      const commitmentHash = keccak256(
        concat([
          getBytes(encrypted.encryptedData.startsWith("0x") ? encrypted.encryptedData : "0x" + encrypted.encryptedData),
          getBytes(encrypted.nonce.startsWith("0x") ? encrypted.nonce : "0x" + encrypted.nonce),
          getBytes(encrypted.tag.startsWith("0x") ? encrypted.tag : "0x" + encrypted.tag),
        ])
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

      logState(ExecutionStatus.ESTIMATING_GAS);
      try {
        await this.blockchain.estimateGasFinalizeExecution(
          workflowId,
          commitmentHash,
          proof,
          nonce
        );
      } catch (gasErr) {
        log.error({ err: gasErr }, "Gas estimation failed; aborting without sending tx");
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
            { txHash: tx.hash, commitmentHash, nonce: nonce.toString() },
            "Execution finalized on-chain"
          );
          return;
        } catch (err) {
          lastError = err;
          log.warn({ err, attempt }, "finalizeExecution attempt failed");
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
      log.error({ err }, "Execution failed");
      logState(ExecutionStatus.FAILED, { error: err != null ? String(err) : undefined });
      throw err;
    }
  }

}
