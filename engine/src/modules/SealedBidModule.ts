import type { WorkflowConfig } from "../types/workflow";
import type { ModuleResult } from "../types/execution";
import { commitmentHash } from "../utils/crypto";

/**
 * Sealed bid auction module (stub).
 * Fully deterministic: depends only on workflowId and workflowConfig (no Date.now, no random).
 * commitmentHash = keccak256(encodedResult).
 */
export function execute(workflowId: bigint, config: WorkflowConfig): ModuleResult {
  const mockResult = {
    module: "SealedBidAuction",
    workflowId: workflowId.toString(),
    workflowHash: config.approvedWorkflowHash,
    highestBid: "0",
    bidCount: 1,
  };
  const encoded = JSON.stringify(mockResult);
  const commitmentHashHex = commitmentHash("0x" + Buffer.from(encoded, "utf-8").toString("hex"));
  return { commitmentHash: commitmentHashHex };
}
