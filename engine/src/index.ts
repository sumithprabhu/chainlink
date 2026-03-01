import pino from "pino";
import { env } from "./config/env";
import { loadCraConfig } from "../cra/config/craConfig";
import { BlockchainAdapter } from "./adapters/BlockchainAdapter";
import { AttestationService } from "./services/AttestationService";
import { SettlementService } from "./services/SettlementService";
import { ExecutionService } from "./services/ExecutionService";
import { WorkflowWatcher } from "./services/WorkflowWatcher";

function main(): void {
  const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
  });

  logger.info(
    {
      chainId: env.CHAIN_ID,
      contract: env.CONTRACT_ADDRESS,
      minConfirmations: env.MIN_CONFIRMATIONS,
      maxRetries: env.MAX_RETRIES,
      executionTimeoutMs: env.EXECUTION_TIMEOUT_MS,
    },
    "Engine starting"
  );

  const blockchain = new BlockchainAdapter({
    rpcUrl: env.RPC_URL,
    privateKey: env.PRIVATE_KEY,
    contractAddress: env.CONTRACT_ADDRESS,
    chainId: env.CHAIN_ID,
    logger,
  });

  const attestation = new AttestationService(logger);
  const settlement = new SettlementService(logger);
  const craConfig = loadCraConfig();
  const execution = new ExecutionService({
    blockchain,
    attestation,
    settlement,
    craConfig,
    creatorAllowlist: env.WORKFLOW_CREATOR_ALLOWLIST,
    executionTimeoutMs: env.EXECUTION_TIMEOUT_MS,
    maxRetries: env.MAX_RETRIES,
    minConfirmations: env.MIN_CONFIRMATIONS,
    logger,
  });

  const watcher = new WorkflowWatcher({
    blockchain,
    execution,
    minConfirmations: env.MIN_CONFIRMATIONS,
    logger,
  });

  watcher.start();
  logger.info("Engine ready; watching for WorkflowCreated");
}

main();
