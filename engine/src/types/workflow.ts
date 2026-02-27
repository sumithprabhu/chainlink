/**
 * Workflow config as returned by the ConfidentialExecutionEngine contract.
 * Mirrors the on-chain WorkflowConfig struct.
 */
export interface WorkflowConfig {
  approvedWorkflowHash: string;
  moduleType: number; // 0 = SEALED_BID_AUCTION, 1 = PRIVATE_VOTING
  settlementMode: number; // 0 = ESCROW, 1 = PRIVATE_SETTLEMENT
  active: boolean;
}

export const ModuleType = {
  SEALED_BID_AUCTION: 0,
  PRIVATE_VOTING: 1,
} as const;

export const SettlementMode = {
  ESCROW: 0,
  PRIVATE_SETTLEMENT: 1,
} as const;
