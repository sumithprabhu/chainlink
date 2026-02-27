import type { WorkflowConfig } from "./workflow.js";

/**
 * Result of running a module (auction or voting).
 * Only commitment hash is produced; no private inputs are stored.
 */
export interface ModuleResult {
  commitmentHash: string;
}

/**
 * Input passed to the execution orchestrator for a single workflow run.
 */
export interface ExecutionInput {
  workflowId: bigint;
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
