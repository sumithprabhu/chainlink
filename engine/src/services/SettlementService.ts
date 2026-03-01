import type { Logger } from "pino";
import { SettlementMode } from "../types/workflow";

/**
 * Settlement Layer: branching and logging only. All settlement-mode logic must remain here.
 * ExecutionService only passes through workflowId and settlementMode from contract config.
 */
export class SettlementService {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: "SettlementService" });
  }

  handleSettlementMode(workflowId: bigint, settlementMode: number): void {
    if (settlementMode === SettlementMode.ESCROW) {
      this.logger.info(
        { workflowId: workflowId.toString() },
        "Settlement mode ESCROW (no value on finalize); real settlement not implemented"
      );
    } else if (settlementMode === SettlementMode.PRIVATE_SETTLEMENT) {
      this.logger.info(
        { workflowId: workflowId.toString() },
        "Settlement mode PRIVATE_SETTLEMENT; real settlement not implemented"
      );
    } else {
      this.logger.warn(
        { workflowId: workflowId.toString(), settlementMode },
        "Unknown settlement mode"
      );
    }
  }
}
