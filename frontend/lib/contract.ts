export const CONFIDENTIAL_ENGINE_ABI = [
  {
    type: "event",
    name: "WorkflowCreated",
    inputs: [
      { name: "workflowId", type: "uint256", indexed: true },
      { name: "approvedWorkflowHash", type: "bytes32", indexed: true },
      { name: "moduleType", type: "uint8", indexed: false },
      { name: "settlementMode", type: "uint8", indexed: false },
    ],
  },
  {
    type: "function",
    name: "getWorkflowConfig",
    stateMutability: "view",
    inputs: [{ name: "workflowId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "approvedWorkflowHash", type: "bytes32" },
          { name: "moduleType", type: "uint8" },
          { name: "settlementMode", type: "uint8" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getExecutionCount",
    stateMutability: "view",
    inputs: [{ name: "workflowId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getExecutionRecord",
    stateMutability: "view",
    inputs: [
      { name: "workflowId", type: "uint256" },
      { name: "executionIndex", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "commitmentHash", type: "bytes32" },
          { name: "finalized", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "escrowedBids",
    stateMutability: "view",
    inputs: [
      { name: "workflowId", type: "uint256" },
      { name: "bidder", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "escrowReleased",
    stateMutability: "view",
    inputs: [{ name: "workflowId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getBidderCount",
    stateMutability: "view",
    inputs: [{ name: "workflowId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getAuctionConfig",
    stateMutability: "view",
    inputs: [{ name: "workflowId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "minBidIncrement", type: "uint256" },
          { name: "reservePrice", type: "uint256" },
          { name: "maxBidders", type: "uint256" },
          { name: "softCloseEnabled", type: "bool" },
          { name: "softCloseWindow", type: "uint256" },
          { name: "softCloseExtension", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "nextWorkflowId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "dynamicEndTime",
    stateMutability: "view",
    inputs: [{ name: "workflowId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isAuctionClosable",
    stateMutability: "view",
    inputs: [{ name: "workflowId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "createWorkflow",
    stateMutability: "payable",
    inputs: [
      { name: "approvedWorkflowHash", type: "bytes32" },
      { name: "moduleType", type: "uint8" },
      { name: "settlementMode", type: "uint8" },
      { name: "auctionEndTime", type: "uint256" },
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "minBidIncrement", type: "uint256" },
          { name: "reservePrice", type: "uint256" },
          { name: "maxBidders", type: "uint256" },
          { name: "softCloseEnabled", type: "bool" },
          { name: "softCloseWindow", type: "uint256" },
          { name: "softCloseExtension", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositBid",
    stateMutability: "payable",
    inputs: [{ name: "workflowId", type: "uint256" }],
    outputs: [],
  },
] as const;

export const MODULE_TYPE_SEALED_BID_AUCTION = 0;
export const SETTLEMENT_MODE_ESCROW = 0;
