import type { Logger } from "pino";
import type { BlockchainAdapter } from "../adapters/BlockchainAdapter";
import type { AttestationService } from "./AttestationService";
import type { SettlementService } from "./SettlementService";
import type { WorkflowConfig } from "../types/workflow";
import type { ModuleResult } from "../types/execution";
import { ModuleType } from "../types/workflow";
import * as SealedBidModule from "../modules/SealedBidModule";
import * as PrivateVotingModule from "../modules/PrivateVotingModule";

export interface ExecutionServiceConfig {
  blockchain: BlockchainAdapter;
  attestation: AttestationService;
  settlement: SettlementService;
  logger: Logger;
}

export class ExecutionService {
  private readonly blockchain: BlockchainAdapter;
  private readonly attestation: AttestationService;
  private readonly settlement: SettlementService;
  private readonly logger: Logger;

  constructor(config: ExecutionServiceConfig) {
    this.blockchain = config.blockchain;
    this.attestation = config.attestation;
    this.settlement = config.settlement;
    this.logger = config.logger.child({ service: "ExecutionService" });
  }

  async run(workflowId: bigint): Promise<void> {
    const log = this.logger.child({ workflowId: workflowId.toString() });
    try {
      log.info("Execution started");

      const executionCount = await this.blockchain.getExecutionCount(workflowId);
      if (executionCount > 0n) {
        const record = await this.blockchain.getExecutionRecord(workflowId, 0n);
        if (record.finalized) {
          log.info("Idempotency: workflow already has finalized execution; skipping");
          return;
        }
      }
      const nonce = executionCount; // next unused nonce = current execution count

      const config = await this.blockchain.getWorkflowConfig(workflowId);
      if (!config.active) {
        log.warn("Workflow is not active; skipping");
        return;
      }

      this.settlement.handleSettlementMode(workflowId, config.settlementMode);

      const result = this.selectAndExecute(workflowId, config);
      const proof = this.attestation.generate(
        config.approvedWorkflowHash,
        result.commitmentHash,
        nonce
      );
      if (!this.attestation.validateStructure(proof)) {
        throw new Error("Attestation structure validation failed");
      }

      const tx = await this.blockchain.finalizeExecution(
        workflowId,
        result.commitmentHash,
        proof,
        nonce
      );
      await this.blockchain.waitForTransaction(tx);

      log.info(
        { txHash: tx.hash, commitmentHash: result.commitmentHash, nonce: nonce.toString() },
        "Execution finalized on-chain"
      );
    } catch (err) {
      log.error({ err }, "Execution failed");
      throw err;
    }
  }

  private selectAndExecute(workflowId: bigint, config: WorkflowConfig): ModuleResult {
    if (config.moduleType === ModuleType.SEALED_BID_AUCTION) {
      return SealedBidModule.execute(workflowId, config);
    }
    if (config.moduleType === ModuleType.PRIVATE_VOTING) {
      return PrivateVotingModule.execute(workflowId, config);
    }
    throw new Error(`Unknown moduleType: ${config.moduleType}`);
  }
}
