export interface AuctionSummary {
  workflowId: string;
  status: "active" | "ending_soon" | "closed";
  bidderCount: bigint;
  reservePrice?: bigint;
  dynamicEndTime?: bigint;
}

export interface WorkflowConfig {
  approvedWorkflowHash: string;
  moduleType: number;
  settlementMode: number;
  active: boolean;
}

export interface AuctionConfig {
  startTime: bigint;
  endTime: bigint;
  minBidIncrement: bigint;
  reservePrice: bigint;
  maxBidders: bigint;
  softCloseEnabled: boolean;
  softCloseWindow: bigint;
  softCloseExtension: bigint;
}
