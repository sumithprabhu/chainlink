import type { WorkflowConfig } from "../types/workflow";
import type { ModuleResult } from "../types/execution";
import { commitmentHash } from "../utils/crypto";

/**
 * Private voting module (stub).
 * Fully deterministic: depends only on workflowId and workflowConfig (no Date.now, no random).
 * commitmentHash = keccak256(encodedResult).
 */
export function execute(workflowId: bigint, config: WorkflowConfig): ModuleResult {
  const mockResult = {
    module: "PrivateVoting",
    workflowId: workflowId.toString(),
    workflowHash: config.approvedWorkflowHash,
    tallyYes: 1,
    tallyNo: 0,
  };
  const encoded = JSON.stringify(mockResult);
  const commitmentHashHex = commitmentHash("0x" + Buffer.from(encoded, "utf-8").toString("hex"));
  return { commitmentHash: commitmentHashHex };
}
