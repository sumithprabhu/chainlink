import express from "express";
import pino from "pino";
import { env } from "./config/env";
import { loadCraConfig } from "../cra/config/craConfig";
import { EnvSecretProvider } from "../cra/secretProvider/EnvSecretProvider";
import { VaultDonSecretProvider } from "../cra/secretProvider/VaultDonSecretProvider";
import { runRealConfidentialHttpWorkflow } from "../cra/workflow/realConfidentialHttpWorkflow";
import { BlockchainAdapter } from "./adapters/BlockchainAdapter";
import { AttestationService } from "./services/AttestationService";
import { SettlementService } from "./services/SettlementService";
import { ExecutionService } from "./services/ExecutionService";
import { WorkflowWatcher } from "./services/WorkflowWatcher";
import { AuctionService } from "./services/AuctionService";
import { createBidRouter } from "./api/BidController";

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
  const useRealCra = craConfig.USE_REAL_CRA === true;
  const secretProvider = useRealCra
    ? new VaultDonSecretProvider()
    : new EnvSecretProvider({
        [craConfig.API_KEY_SECRET_NAME]: "ENGINE_API_KEY",
        [craConfig.AES_ENCRYPTION_KEY_SECRET_NAME]: "ENGINE_AES_ENCRYPTION_KEY",
      });
  const runCra = useRealCra
    ? (input: { workflowId: string; inputHash: string }) =>
        runRealConfidentialHttpWorkflow(
          {
            craConfig,
            privateKey: env.PRIVATE_KEY,
            timeoutMs: env.EXECUTION_TIMEOUT_MS,
          },
          input
        )
    : undefined;
  const execution = new ExecutionService({
    blockchain,
    attestation,
    settlement,
    craConfig,
    secretProvider,
    runCra,
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

  const auction = new AuctionService({
    blockchain,
    attestation,
    settlement,
    craConfig,
    secretProvider,
    maxRetries: env.MAX_RETRIES,
    minConfirmations: env.MIN_CONFIRMATIONS,
    logger,
  });

  // Auto-close loop — contract is final authority. Only configured auctions (startTime != 0) are closable; legacy auctions are not auto-closed.
  const AUTO_CLOSE_INTERVAL_MS = 30_000;
  setInterval(async () => {
    try {
      const nextId = await blockchain.getNextWorkflowId();
      for (let wid = 1n; wid < nextId; wid++) {
        try {
          const closable = await blockchain.isAuctionClosable(wid);
          if (!closable) continue;
          const config = await blockchain.getWorkflowConfig(wid);
          if (!config.active || config.moduleType !== 0) continue; // 0 = SEALED_BID_AUCTION
          await auction.closeAuction(Number(wid));
          logger.info({ workflowId: wid.toString() }, "Auto-closed auction");
        } catch (err) {
          logger.debug({ workflowId: wid.toString(), err: String(err) }, "Auto-close skip or failed");
        }
      }
    } catch (err) {
      logger.warn({ err: String(err) }, "Auto-close loop error");
    }
  }, AUTO_CLOSE_INTERVAL_MS);

  const app = express();
  app.use(express.json());
  app.use(
    "/",
    createBidRouter(auction, logger, {
      chainId: env.CHAIN_ID,
      verifyingContract: env.CONTRACT_ADDRESS,
    })
  );
  app.listen(env.API_PORT, () => {
    logger.info({ port: env.API_PORT }, "Bid API listening");
  });

  logger.info("Engine ready; watching for WorkflowCreated");
}

main();
