/**
 * This adapter represents the Onchain Interaction Layer.
 * It must remain stateless and not contain business logic.
 */
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  type ContractTransactionResponse,
} from "ethers";
import type { WorkflowConfig, AuctionConfig } from "../types/workflow";
import type { Logger } from "pino";

const CREATION_DEPOSIT_WEI = BigInt("1000000000000000"); // 0.001 ether

const CONFIDENTIAL_ENGINE_ABI = [
  "event WorkflowCreated(uint256 indexed workflowId, bytes32 indexed approvedWorkflowHash, uint8 moduleType, uint8 settlementMode)",
  "function getWorkflowConfig(uint256 workflowId) view returns (tuple(bytes32 approvedWorkflowHash, uint8 moduleType, uint8 settlementMode, bool active))",
  "function getExecutionCount(uint256 workflowId) view returns (uint256)",
  "function getExecutionRecord(uint256 workflowId, uint256 executionIndex) view returns (tuple(bytes32 commitmentHash, bool finalized))",
  "function finalizeExecution(uint256 workflowId, bytes32 commitmentHash, bytes attestationProof, uint256 nonce) payable",
  "function depositBid(uint256 workflowId) payable",
  "function releaseEscrow(uint256 workflowId, address winner)",
  "function escrowedBids(uint256 workflowId, address bidder) view returns (uint256)",
  "function escrowReleased(uint256 workflowId) view returns (bool)",
  "function getBidderCount(uint256 workflowId) view returns (uint256)",
  "function getAuctionConfig(uint256 workflowId) view returns (tuple(uint256 startTime, uint256 endTime, uint256 minBidIncrement, uint256 reservePrice, uint256 maxBidders, bool softCloseEnabled, uint256 softCloseWindow, uint256 softCloseExtension))",
  "function nextWorkflowId() view returns (uint256)",
  "function isAuctionClosable(uint256 workflowId) view returns (bool)",
  "function createWorkflow(bytes32 approvedWorkflowHash, uint8 moduleType, uint8 settlementMode, uint256 auctionEndTime, (uint256 startTime, uint256 endTime, uint256 minBidIncrement, uint256 reservePrice, uint256 maxBidders, bool softCloseEnabled, uint256 softCloseWindow, uint256 softCloseExtension)) payable",
] as const;

export interface ExecutionRecord {
  commitmentHash: string;
  finalized: boolean;
}

function toWorkflowConfig(raw: readonly [string, number, number, boolean]): WorkflowConfig {
  return {
    approvedWorkflowHash: raw[0],
    moduleType: raw[1],
    settlementMode: raw[2],
    active: raw[3],
  };
}

export interface BlockchainAdapterConfig {
  rpcUrl: string;
  privateKey: string;
  contractAddress: string;
  chainId: number;
  logger: Logger;
}

export class BlockchainAdapter {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly contract: Contract;
  private readonly logger: Logger;

  constructor(config: BlockchainAdapterConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
    this.wallet = new Wallet(config.privateKey, this.provider);
    this.contract = new Contract(
      config.contractAddress,
      CONFIDENTIAL_ENGINE_ABI,
      this.wallet
    );
    this.logger = config.logger.child({ adapter: "BlockchainAdapter" });
  }

  getContract(): Contract {
    return this.contract;
  }

  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  getWalletAddress(): string {
    return this.wallet.address.toLowerCase();
  }

  /** Wait until chain has at least blockNumber + confirmations. */
  async waitForConfirmations(blockNumber: number, confirmations: number): Promise<void> {
    const target = blockNumber + confirmations;
    while (true) {
      const current = await this.provider.getBlockNumber();
      if (current >= target) return;
      this.logger.debug({ current, target }, "Waiting for confirmations");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  /** Get creator (from) of the transaction that emitted WorkflowCreated. */
  async getTransactionCreator(txHash: string): Promise<string> {
    const tx = await this.provider.getTransaction(txHash);
    if (!tx?.from) throw new Error(`Transaction not found or no from: ${txHash}`);
    return tx.from.toLowerCase();
  }

  async getWorkflowConfig(workflowId: bigint): Promise<WorkflowConfig> {
    const raw = await this.contract.getWorkflowConfig(workflowId);
    return toWorkflowConfig(raw);
  }

  /** Number of finalized executions for this workflow. Next nonce to use = this value. */
  async getExecutionCount(workflowId: bigint): Promise<bigint> {
    return this.contract.getExecutionCount(workflowId);
  }

  async getExecutionRecord(workflowId: bigint, executionIndex: bigint): Promise<ExecutionRecord> {
    const [commitmentHash, finalized] = await this.contract.getExecutionRecord(
      workflowId,
      executionIndex
    );
    return { commitmentHash, finalized };
  }

  async estimateGasFinalizeExecution(
    workflowId: bigint,
    commitmentHash: string,
    attestationProof: string,
    nonce: bigint
  ): Promise<bigint> {
    return this.contract.finalizeExecution.estimateGas(
      workflowId,
      commitmentHash,
      attestationProof,
      nonce,
      { value: 0n }
    );
  }

  async finalizeExecution(
    workflowId: bigint,
    commitmentHash: string,
    attestationProof: string,
    nonce: bigint
  ): Promise<ContractTransactionResponse> {
    this.logger.info(
      { workflowId: workflowId.toString(), status: "SUBMITTING_TX" },
      "Calling finalizeExecution"
    );
    const tx = await this.contract.finalizeExecution(
      workflowId,
      commitmentHash,
      attestationProof,
      nonce,
      { value: 0n }
    );
    return tx;
  }

  async waitForTransaction(tx: ContractTransactionResponse, confirmations?: number): Promise<void> {
    await tx.wait(confirmations ?? undefined);
  }

  /** Escrow: lock bidder funds. Caller (engine or bidder) must send valueWei. */
  async depositBid(workflowId: bigint, valueWei: bigint): Promise<ContractTransactionResponse> {
    this.logger.info(
      { workflowId: workflowId.toString(), valueWei: valueWei.toString() },
      "Calling depositBid"
    );
    const tx = await this.contract.depositBid(workflowId, { value: valueWei });
    return tx;
  }

  /** Escrow: read escrowed amount for a bidder. */
  async getEscrowedBid(workflowId: bigint, bidder: string): Promise<bigint> {
    return this.contract.escrowedBids(workflowId, bidder);
  }

  /** Escrow: release to winner and refund others. Call after finalizeExecution. */
  async releaseEscrow(workflowId: bigint, winner: string): Promise<ContractTransactionResponse> {
    this.logger.info(
      { workflowId: workflowId.toString(), winner },
      "Calling releaseEscrow"
    );
    return this.contract.releaseEscrow(workflowId, winner);
  }

  async isEscrowReleased(workflowId: bigint): Promise<boolean> {
    return this.contract.escrowReleased(workflowId);
  }

  async getBidderCount(workflowId: bigint): Promise<bigint> {
    return this.contract.getBidderCount(workflowId);
  }

  async getAuctionConfig(workflowId: bigint): Promise<AuctionConfig> {
    const raw = await this.contract.getAuctionConfig(workflowId) as
      | { startTime: bigint; endTime: bigint; minBidIncrement: bigint; reservePrice: bigint; maxBidders: bigint; softCloseEnabled: boolean; softCloseWindow: bigint; softCloseExtension: bigint }
      | (bigint | boolean)[];
    const r = raw as { startTime?: bigint; endTime?: bigint; minBidIncrement?: bigint; reservePrice?: bigint; maxBidders?: bigint; softCloseEnabled?: boolean; softCloseWindow?: bigint; softCloseExtension?: bigint; 0?: bigint; 1?: bigint; 2?: bigint; 3?: bigint; 4?: bigint; 5?: boolean; 6?: bigint; 7?: bigint };
    return {
      startTime: r.startTime ?? r[0] ?? 0n,
      endTime: r.endTime ?? r[1] ?? 0n,
      minBidIncrement: r.minBidIncrement ?? r[2] ?? 0n,
      reservePrice: r.reservePrice ?? r[3] ?? 0n,
      maxBidders: r.maxBidders ?? r[4] ?? 0n,
      softCloseEnabled: r.softCloseEnabled ?? (r[5] as boolean) ?? false,
      softCloseWindow: r.softCloseWindow ?? r[6] ?? 0n,
      softCloseExtension: r.softCloseExtension ?? r[7] ?? 0n,
    };
  }

  async getBlockTimestamp(): Promise<number> {
    const block = await this.provider.getBlock("latest");
    if (!block?.timestamp) throw new Error("Failed to get block timestamp");
    return block.timestamp;
  }

  /** Next workflow ID to be assigned (workflow IDs in use are 1 to nextWorkflowId - 1). */
  async getNextWorkflowId(): Promise<bigint> {
    return this.contract.nextWorkflowId();
  }

  /** True if configured auction has passed dynamicEndTime and execution not yet finalized. Legacy auctions (startTime == 0) return false. */
  async isAuctionClosable(workflowId: bigint): Promise<boolean> {
    return this.contract.isAuctionClosable(workflowId);
  }

  /** Create a new workflow. Caller must send CREATION_DEPOSIT. */
  async createWorkflow(
    approvedWorkflowHash: string,
    moduleType: number,
    settlementMode: number,
    auctionEndTime: bigint,
    config: AuctionConfig
  ): Promise<ContractTransactionResponse> {
    this.logger.info(
      { moduleType, settlementMode },
      "Calling createWorkflow"
    );
    const tx = await this.contract.createWorkflow(
      approvedWorkflowHash,
      moduleType,
      settlementMode,
      auctionEndTime,
      {
        startTime: config.startTime,
        endTime: config.endTime,
        minBidIncrement: config.minBidIncrement,
        reservePrice: config.reservePrice,
        maxBidders: config.maxBidders,
        softCloseEnabled: config.softCloseEnabled,
        softCloseWindow: config.softCloseWindow,
        softCloseExtension: config.softCloseExtension,
      },
      { value: CREATION_DEPOSIT_WEI }
    );
    return tx;
  }
}

export { CREATION_DEPOSIT_WEI };
