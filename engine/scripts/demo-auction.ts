/**
 * Demo: sealed-bid auction with escrow.
 * 1) Create workflow on-chain.
 * 2) For each bidder: depositBid(workflowId) with ETH, then POST /bid.
 * 3) Close auction (pass winnerAddress for stub).
 * 4) Verify: executionCount === 1, finalized === true, escrowReleased === true,
 *    winner balance increased, non-winners refunded.
 *
 * Usage: from engine/ with .env set:
 *   - Start engine in another terminal: npm run dev
 *   - Set AUCTION_CRA_STUB=true for stub CRA.
 *   - Optional: BIDDER2_PRIVATE_KEY, BIDDER3_PRIVATE_KEY for multi-bidder (else engine wallet used 3x).
 *   - npx ts-node scripts/demo-auction.ts
 */
import "dotenv/config";
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  keccak256,
  toUtf8Bytes,
  signTypedData,
} from "ethers";

const ABI = [
  "function createWorkflow(bytes32 approvedWorkflowHash, uint8 moduleType, uint8 settlementMode, uint256 auctionEndTime, (uint256 startTime, uint256 endTime, uint256 minBidIncrement, uint256 reservePrice, uint256 maxBidders, bool softCloseEnabled, uint256 softCloseWindow, uint256 softCloseExtension))",
  "function nextWorkflowId() view returns (uint256)",
  "function getWorkflowConfig(uint256 workflowId) view returns (tuple(bytes32 approvedWorkflowHash, uint8 moduleType, uint8 settlementMode, bool active))",
  "function getExecutionCount(uint256 workflowId) view returns (uint256)",
  "function getExecutionRecord(uint256 workflowId, uint256 executionIndex) view returns (tuple(bytes32 commitmentHash, bool finalized))",
  "function depositBid(uint256 workflowId) payable",
  "function escrowedBids(uint256 workflowId, address bidder) view returns (uint256)",
  "function escrowReleased(uint256 workflowId) view returns (bool)",
] as const;

const MODULE_TYPE = 0; // SEALED_BID_AUCTION
const SETTLEMENT_MODE = 0; // ESCROW
const CREATION_DEPOSIT = BigInt(1e15); // 0.001 ether
const APPROVED_HASH = keccak256(toUtf8Bytes("test-workflow"));
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

const BID_DOMAIN = {
  name: "ConfidentialAuction",
  version: "1",
} as const;
const BID_TYPES = {
  Bid: [
    { name: "workflowId", type: "uint256" },
    { name: "bidAmount", type: "uint256" },
    { name: "confidentialBidAmount", type: "string" },
  ],
} as const;

// Bid amounts in wei (small for testnets)
const BID_AMOUNTS = [100n, 200n, 150n];

function getEnv(name: string, def?: string): string {
  const v = process.env[name] ?? def;
  if (v == null || v === "") {
    console.error(`Demo error: ${name} is required in .env`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const rpcUrl = getEnv("RPC_URL");
  const privateKey = getEnv("PRIVATE_KEY");
  const contractAddress = getEnv("CONTRACT_ADDRESS");
  const chainId = parseInt(getEnv("CHAIN_ID"), 10);
  const apiPort = process.env.API_PORT ?? "3000";
  const baseUrl = `http://localhost:${apiPort}`;

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const wallet1 = new Wallet(privateKey, provider);
  const wallet2 = process.env.BIDDER2_PRIVATE_KEY
    ? new Wallet(process.env.BIDDER2_PRIVATE_KEY, provider)
    : wallet1;
  const wallet3 = process.env.BIDDER3_PRIVATE_KEY
    ? new Wallet(process.env.BIDDER3_PRIVATE_KEY, provider)
    : wallet1;

  const contract = new Contract(contractAddress, ABI, wallet1);

  console.log("Creating workflow...");
  const createTx = await contract.createWorkflow(
    APPROVED_HASH,
    MODULE_TYPE,
    SETTLEMENT_MODE,
    0,
    LEGACY_AUCTION_CONFIG,
    { value: CREATION_DEPOSIT }
  );
  await createTx.wait();
  const workflowId = (await contract.nextWorkflowId()) - 1n;
  const workflowIdNum = Number(workflowId);
  console.log("WorkflowId:", workflowId.toString());

  const bidders = [
    { wallet: wallet1, amount: BID_AMOUNTS[0] },
    { wallet: wallet2, amount: BID_AMOUNTS[1] },
    { wallet: wallet3, amount: BID_AMOUNTS[2] },
  ];

  const balancesBefore: bigint[] = [];
  for (const b of bidders) {
    balancesBefore.push(await provider.getBalance(b.wallet.address));
  }

  const domain = {
    ...BID_DOMAIN,
    chainId,
    verifyingContract: contractAddress,
  };

  for (let i = 0; i < bidders.length; i++) {
    const b = bidders[i];
    const contractWithSigner = new Contract(contractAddress, ABI, b.wallet);
    console.log(`Depositing ${b.amount.toString()} wei from ${b.wallet.address}...`);
    const depositTx = await contractWithSigner.depositBid(workflowId, { value: b.amount });
    await depositTx.wait();
    const confidentialBidAmount = b.amount.toString();
    const value = { workflowId: workflowId, bidAmount: b.amount, confidentialBidAmount };
    const signature = await b.wallet.signTypedData(domain, BID_TYPES, value);
    const res = await fetch(`${baseUrl}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowId: workflowIdNum,
        bidAmount: b.amount.toString(),
        confidentialBidAmount,
        bidderAddress: b.wallet.address,
        signature,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Bid failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as { status?: string };
    if (data.status !== "accepted") throw new Error("Expected status accepted");
    console.log("Bid accepted for", b.wallet.address);
  }

  const winnerIndex = 1;
  const winnerAddress = bidders[winnerIndex].wallet.address;
  console.log("Closing auction (stub winner must match AUCTION_STUB_WINNER_ADDRESS:", winnerAddress, ")...");
  const closeRes = await fetch(`${baseUrl}/close-auction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId: workflowIdNum }),
  });
  if (!closeRes.ok) {
    const err = await closeRes.text();
    throw new Error(`Close auction failed: ${closeRes.status} ${err}`);
  }
  const closeData = (await closeRes.json()) as { status?: string; commitmentHash?: string };
  if (closeData.status !== "closed" || !closeData.commitmentHash) {
    throw new Error("Expected status closed and commitmentHash");
  }
  console.log("commitmentHash:", closeData.commitmentHash);

  const executionCount = await contract.getExecutionCount(workflowId);
  const record = await contract.getExecutionRecord(workflowId, 0n);
  if (executionCount !== 1n) {
    console.error("Demo error: expected executionCount === 1, got", executionCount.toString());
    process.exit(1);
  }
  if (!record.finalized) {
    console.error("Demo error: expected finalized === true");
    process.exit(1);
  }

  const released = await contract.escrowReleased(workflowId);
  if (!released) {
    console.error("Demo error: expected escrowReleased === true");
    process.exit(1);
  }
  console.log("Verified: executionCount === 1, finalized === true, escrowReleased === true.");

  const balancesAfter: bigint[] = [];
  for (const b of bidders) {
    balancesAfter.push(await provider.getBalance(b.wallet.address));
  }

  const winnerAmount = BID_AMOUNTS[winnerIndex];
  if (balancesAfter[winnerIndex] <= balancesBefore[winnerIndex]) {
    console.error("Demo error: winner balance did not increase");
    process.exit(1);
  }
  console.log("Winner balance increased (before:", balancesBefore[winnerIndex].toString(), "after:", balancesAfter[winnerIndex].toString(), ").");

  for (let i = 0; i < bidders.length; i++) {
    if (i === winnerIndex) continue;
    const escrowed = await contract.escrowedBids(workflowId, bidders[i].wallet.address);
    if (escrowed !== 0n) {
      console.error("Demo error: non-winner", bidders[i].wallet.address, "still has escrowed", escrowed.toString());
      process.exit(1);
    }
  }
  console.log("Non-winners refunded (escrowedBids === 0).");

  const contractBalance = await provider.getBalance(contractAddress);
  if (contractBalance !== 0n) {
    console.error("Demo error: contract balance should be 0 after release, got", contractBalance.toString());
    process.exit(1);
  }
  console.log("Contract balance == 0 after escrow release.");

  const winnerEscrowed = await contract.escrowedBids(workflowId, winnerAddress);
  if (winnerEscrowed !== 0n) {
    console.error("Demo error: winner escrowedBids should be 0 after release, got", winnerEscrowed.toString());
    process.exit(1);
  }
  console.log("All escrowedBids[workflowId][addr] == 0.");
  console.log("Demo success.");
}

main().catch((e) => {
  console.error("Demo error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
