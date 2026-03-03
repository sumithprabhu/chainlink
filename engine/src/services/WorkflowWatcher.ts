import type { Logger } from "pino";
import type { BlockchainAdapter } from "../adapters/BlockchainAdapter";
import type { ExecutionService } from "./ExecutionService";
import type { WorkflowEventPayload } from "../types/execution";

const CIRCUIT_BREAKER_THRESHOLD = 5;
const POLL_INTERVAL_MS = 2000;

export interface WorkflowWatcherConfig {
  blockchain: BlockchainAdapter;
  execution: ExecutionService;
  minConfirmations: number;
  logger: Logger;
}

/**
 * Polls for WorkflowCreated, waits for block confirmations, then enqueues.
 * Sequential processing with circuit breaker on consecutive failures.
 */
export class WorkflowWatcher {
  private readonly blockchain: BlockchainAdapter;
  private readonly execution: ExecutionService;
  private readonly minConfirmations: number;
  private readonly logger: Logger;
  private readonly queue: WorkflowEventPayload[] = [];
  private processing = false;
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private lastProcessedBlock = -1;

  constructor(config: WorkflowWatcherConfig) {
    this.blockchain = config.blockchain;
    this.execution = config.execution;
    this.minConfirmations = config.minConfirmations;
    this.logger = config.logger.child({ component: "WorkflowWatcher" });
  }

  start(): void {
    this.poll();
    this.logger.info(
      { minConfirmations: this.minConfirmations },
      "Listening for WorkflowCreated (polling with confirmation safety)"
    );
  }

  private async poll(): Promise<void> {
    if (this.circuitOpen) return;
    try {
      const provider = this.blockchain.getProvider();
      if (this.lastProcessedBlock < 0) {
        this.lastProcessedBlock = await provider.getBlockNumber();
      }
      const contract = this.blockchain.getContract();
      const fromBlock = this.lastProcessedBlock + 1;
      const toBlock = "latest";
      const events = await contract.queryFilter(
        contract.getEvent("WorkflowCreated"),
        fromBlock,
        toBlock
      );
      for (const event of events) {
        const blockNumber = event.blockNumber;
        const workflowId = (event as { args: unknown[] }).args[0] as bigint;
        const txHash = (event as { transactionHash?: string }).transactionHash;
        if (!txHash) {
          this.logger.warn({ workflowId: (workflowId as bigint).toString() }, "WorkflowCreated event missing transactionHash; skipping");
          continue;
        }
        this.logger.info(
          { workflowId: workflowId.toString(), blockNumber, txHash },
          "WorkflowCreated received"
        );
        await this.blockchain.waitForConfirmations(blockNumber, this.minConfirmations);
        this.enqueue({
          workflowId,
          blockNumber,
          transactionHash: txHash,
        });
        this.lastProcessedBlock = Math.max(this.lastProcessedBlock, blockNumber);
      }
      if (events.length > 0) {
        this.lastProcessedBlock = events.reduce(
          (max, e) => Math.max(max, e.blockNumber),
          this.lastProcessedBlock
        );
      }
    } catch (err) {
      this.logger.warn({ err }, "Poll error");
    }
    setTimeout(() => this.poll(), POLL_INTERVAL_MS);
  }

  private enqueue(payload: WorkflowEventPayload): void {
    if (this.circuitOpen) {
      this.logger.warn({ workflowId: payload.workflowId.toString() }, "Circuit open; not enqueueing");
      return;
    }
    this.queue.push(payload);
    this.processNext();
  }

  private processNext(): void {
    if (this.circuitOpen || this.processing || this.queue.length === 0) return;
    this.processing = true;
    const payload = this.queue.shift()!;
    this.execution
      .run(payload.workflowId, payload.transactionHash)
      .then(() => {
        this.consecutiveFailures = 0;
      })
      .catch((err) => {
        this.logger.error(
          { err, workflowId: payload.workflowId.toString() },
          "Execution error"
        );
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          this.circuitOpen = true;
          this.logger.fatal(
            { consecutiveFailures: this.consecutiveFailures },
            "Circuit breaker open; stopping processing. Manual restart required."
          );
        }
      })
      .finally(() => {
        this.processing = false;
        if (!this.circuitOpen && this.queue.length > 0) this.processNext();
      });
  }
}
