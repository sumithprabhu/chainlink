import type { WorkflowConfig } from "./workflow";

/**
 * Result of running a module (auction or voting).
 * Only commitment hash is produced; no private inputs are stored.
 */
export interface ModuleResult {
  commitmentHash: string;
}

/**
 * Payload from WorkflowCreated (with block/tx info for confirmations and creator).
 */
export interface WorkflowEventPayload {
  workflowId: bigint;
  blockNumber: number;
  transactionHash: string;
}

/**
 * Input passed to the execution orchestrator for a single workflow run.
 */
export interface ExecutionInput {
  workflowId: bigint;
  transactionHash: string;
}

/**
 * Full context for one execution: config from chain + module result.
 */
export interface ExecutionContext {
  workflowId: bigint;
  config: WorkflowConfig;
  result: ModuleResult;
  nonce: bigint;
}
