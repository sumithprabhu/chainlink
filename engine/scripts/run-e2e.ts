/**
 * Full flow E2E: assert WorkflowCreated → engine execution → finalizeExecution → commitment stored → finalized.
 * Usage: npm run e2e (from engine/) with engine/.env set for Sepolia.
 * Timeout: 60 seconds.
 */
import "dotenv/config";
import { JsonRpcProvider, Wallet, Contract } from "ethers";

const TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

const ABI = [
  "function nextWorkflowId() view returns (uint256)",
  "function getWorkflowConfig(uint256 workflowId) view returns (tuple(bytes32 approvedWorkflowHash, uint8 moduleType, uint8 settlementMode, bool active))",
  "function getExecutionCount(uint256 workflowId) view returns (uint256)",
  "function getExecutionRecord(uint256 workflowId, uint256 executionIndex) view returns (tuple(bytes32 commitmentHash, bool finalized))",
] as const;

function getEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === "") {
    console.error(`E2E error: ${name} is required in .env`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const rpcUrl = getEnv("RPC_URL");
  const privateKey = getEnv("PRIVATE_KEY");
  const contractAddress = getEnv("CONTRACT_ADDRESS");
  const chainId = parseInt(getEnv("CHAIN_ID"), 10);
  if (Number.isNaN(chainId) || chainId <= 0) {
    console.error("E2E error: CHAIN_ID must be a positive number");
    process.exit(1);
  }

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const wallet = new Wallet(privateKey, provider);
  const contract = new Contract(contractAddress, ABI, wallet);

  const nextId = await contract.nextWorkflowId();
  const workflowId = nextId - 1n;
  if (workflowId === 0n) {
    console.error("E2E error: No workflow found (nextWorkflowId is 1). Create a workflow first (e.g. npm run create:sepolia in contract/).");
    process.exit(1);
  }

  const config = await contract.getWorkflowConfig(workflowId);
  console.log("WorkflowId:", workflowId.toString());
  console.log("Workflow config:", {
    approvedWorkflowHash: config.approvedWorkflowHash,
    moduleType: Number(config.moduleType),
    settlementMode: Number(config.settlementMode),
    active: config.active,
  });

  const deadline = Date.now() + TIMEOUT_MS;
  let executionCount: bigint = 0n;
  while (Date.now() < deadline) {
    executionCount = await contract.getExecutionCount(workflowId);
    if (executionCount > 0n) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (executionCount === 0n) {
    console.error("E2E error: Timeout waiting for executionCount > 0 (engine did not finalize within 60s).");
    process.exit(1);
  }

  const record = await contract.getExecutionRecord(workflowId, 0n);
  console.log("Execution record (index 0):", { commitmentHash: record.commitmentHash, finalized: record.finalized });

  if (!record.finalized) {
    console.error("E2E error: Expected finalized === true.");
    process.exit(1);
  }

  console.log("commitmentHash:", record.commitmentHash);
  console.log("E2E success: WorkflowCreated → execution → finalizeExecution → commitment stored → finalized true.");
}

main().catch((e) => {
  console.error("E2E error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
