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
import type { WorkflowConfig } from "../types/workflow";
import type { Logger } from "pino";

const CONFIDENTIAL_ENGINE_ABI = [
  "event WorkflowCreated(uint256 indexed workflowId, bytes32 indexed approvedWorkflowHash, uint8 moduleType, uint8 settlementMode)",
  "function getWorkflowConfig(uint256 workflowId) view returns (tuple(bytes32 approvedWorkflowHash, uint8 moduleType, uint8 settlementMode, bool active))",
  "function getExecutionCount(uint256 workflowId) view returns (uint256)",
  "function getExecutionRecord(uint256 workflowId, uint256 executionIndex) view returns (tuple(bytes32 commitmentHash, bool finalized))",
  "function finalizeExecution(uint256 workflowId, bytes32 commitmentHash, bytes attestationProof, uint256 nonce) payable",
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
}
