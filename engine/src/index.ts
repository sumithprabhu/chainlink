import pino from "pino";
import { env } from "./config/env";
import { BlockchainAdapter } from "./adapters/BlockchainAdapter";
import { AttestationService } from "./services/AttestationService";
import { SettlementService } from "./services/SettlementService";
import { ExecutionService } from "./services/ExecutionService";
import { WorkflowWatcher } from "./services/WorkflowWatcher";

function main(): void {
  const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
  });

  logger.info({ chainId: env.CHAIN_ID, contract: env.CONTRACT_ADDRESS }, "Engine starting");

  const blockchain = new BlockchainAdapter({
    rpcUrl: env.RPC_URL,
    privateKey: env.PRIVATE_KEY,
    contractAddress: env.CONTRACT_ADDRESS,
    chainId: env.CHAIN_ID,
    logger,
  });

  const attestation = new AttestationService(logger);
  const settlement = new SettlementService(logger);
  const execution = new ExecutionService({
    blockchain,
    attestation,
    settlement,
    logger,
  });

  const watcher = new WorkflowWatcher({
    blockchain,
    execution,
    logger,
  });

  watcher.start();
  logger.info("Engine ready; watching for WorkflowCreated");
}

main();
