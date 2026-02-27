import type { Logger } from "pino";
import type { BlockchainAdapter } from "../adapters/BlockchainAdapter";
import type { ExecutionService } from "./ExecutionService";

export interface WorkflowWatcherConfig {
  blockchain: BlockchainAdapter;
  execution: ExecutionService;
  logger: Logger;
}

/**
 * Subscribes to WorkflowCreated and enqueues workflowId for sequential processing.
 * No business logic; orchestration only. One-at-a-time execution to avoid concurrency issues.
 */
export class WorkflowWatcher {
  private readonly blockchain: BlockchainAdapter;
  private readonly execution: ExecutionService;
  private readonly logger: Logger;
  private readonly queue: bigint[] = [];
  private processing = false;

  constructor(config: WorkflowWatcherConfig) {
    this.blockchain = config.blockchain;
    this.execution = config.execution;
    this.logger = config.logger.child({ component: "WorkflowWatcher" });
  }

  start(): void {
    const contract = this.blockchain.getContract();
    contract.on(
      "WorkflowCreated",
      (
        workflowId: bigint,
        _approvedWorkflowHash: string,
        _moduleType: number,
        _settlementMode: number
      ) => {
        this.logger.info({ workflowId: workflowId.toString() }, "WorkflowCreated received");
        this.enqueue(workflowId);
      }
    );
    this.logger.info("Listening for WorkflowCreated events");
  }

  private enqueue(workflowId: bigint): void {
    this.queue.push(workflowId);
    this.processNext();
  }

  private processNext(): void {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const workflowId = this.queue.shift()!;
    this.execution
      .run(workflowId)
      .catch((err) => {
        this.logger.error({ err, workflowId: workflowId.toString() }, "Execution error");
      })
      .finally(() => {
        this.processing = false;
        if (this.queue.length > 0) this.processNext();
      });
  }
}
