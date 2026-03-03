/**
 * Create a test workflow on Sepolia (for E2E).
 * Usage: npm run create:sepolia (from contract/)
 * Requires: SEPOLIA_RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS in .env
 */
import "dotenv/config";
import { ethers } from "hardhat";

const APPROVED_HASH = ethers.keccak256(ethers.toUtf8Bytes("test-workflow"));
const MODULE_TYPE = 0; // SEALED_BID_AUCTION
const SETTLEMENT_MODE = 0; // ESCROW
const LEGACY_AUCTION_CONFIG = {
  startTime: 0n,
  endTime: 0n,
  minBidIncrement: 0n,
  reservePrice: 0n,
  maxBidders: 0n,
  softCloseEnabled: false,
  softCloseWindow: 0n,
  softCloseExtension: 0n,
};

const CREATION_DEPOSIT = ethers.parseEther("0.001");

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error("CONTRACT_ADDRESS must be set in .env to the deployed engine address");
  }
  const network = await ethers.provider.getNetwork();
  if (Number(network.chainId) !== 11155111) {
    throw new Error("Expected chainId 11155111 (Sepolia)");
  }
  const Engine = await ethers.getContractFactory("ConfidentialExecutionEngine");
  const engine = Engine.attach(contractAddress) as Awaited<ReturnType<typeof Engine.deploy>>;
  const tx = await engine.createWorkflow(
    APPROVED_HASH,
    MODULE_TYPE,
    SETTLEMENT_MODE,
    0,
    LEGACY_AUCTION_CONFIG,
    { value: CREATION_DEPOSIT }
  );
  await tx.wait();
  const workflowId = (await engine.nextWorkflowId()) - 1n;
  console.log("WORKFLOW_ID:", workflowId.toString());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
