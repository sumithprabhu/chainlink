/**
 * Auction CRA client: forwards submitBid / settleAuction to CRA.
 * Escrow amount is on-chain only; confidential bid value is sent to CRA only.
 *
 * --- CRA Workflow design (confidential workflow must support) ---
 * 1) submitBid
 *    - Receives confidentialBidAmount (and bidderAddress, workflowId) only; no escrow amount.
 *    - Store confidential bid amount internally (encrypted in enclave).
 *    - Winner determined solely by confidential logic (e.g. highest confidential bid).
 *    - Return { encryptedReceipt, nonce, tag }.
 *
 * 2) settleAuction
 *    - Decrypt all confidential bids inside enclave; determine winner by confidential logic.
 *    - Return { encryptedData, nonce, tag, winnerAddress, winnerHash }.
 *    - Commitment includes winnerHash; escrow amounts are not part of commitment.
 */
import { createCipheriv, randomBytes } from "crypto";
import { keccak256, solidityPacked } from "ethers";
import type { CraConfig } from "../../cra/config/craConfig";
import type { SecretProvider } from "../../cra/secretProvider/SecretProvider";

export type SubmitBidPayload = {
  action: "submitBid";
  workflowId: number;
  /** Confidential bid amount (for CRA only; separate from on-chain escrow). */
  confidentialBidAmount: string;
  bidderAddress: string;
};

export type SettleAuctionPayload = {
  action: "settleAuction";
  workflowId: number;
};

export type SubmitBidResponse = {
  encryptedReceipt: string;
  nonce: string;
  tag: string;
};

export type SettleAuctionResponse = {
  encryptedData: string;
  nonce: string;
  tag: string;
  /** Winner address for escrow release (when settlementMode is ESCROW). */
  winnerAddress: string;
  /** winnerHash = keccak256(workflowId, winnerAddress); engine validates before releaseEscrow. */
  winnerHash: string;
  /** Winner's confidential bid amount; engine enforces winnerEscrow >= this before releaseEscrow. */
  confidentialBidAmount: string;
};

const AUCTION_PATH = "/auction";

/** Demo stub: when set, return encrypted payload without calling CRA (for demo script). */
function isAuctionStubEnabled(): boolean {
  return process.env.AUCTION_CRA_STUB === "true" || process.env.AUCTION_CRA_STUB === "1";
}

async function stubEncrypt(
  secretProvider: SecretProvider,
  aesSecretName: string,
  plaintext: string
): Promise<{ encrypted: string; nonce: string; tag: string }> {
  const aesKeyHex = await secretProvider.getSecret(aesSecretName);
  const key = Buffer.from(aesKeyHex.replace(/^0x/, ""), "hex");
  if (key.length !== 32) throw new Error("AES key must be 32 bytes");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("hex"),
    nonce: nonce.toString("hex"),
    tag: tag.toString("hex"),
  };
}

export async function callAuctionCraSubmitBid(
  config: CraConfig,
  secretProvider: SecretProvider,
  payload: SubmitBidPayload
): Promise<SubmitBidResponse> {
  if (isAuctionStubEnabled()) {
    const stub = await stubEncrypt(
      secretProvider,
      config.AES_ENCRYPTION_KEY_SECRET_NAME,
      JSON.stringify({
        receipt: "bid-received",
        workflowId: payload.workflowId,
        confidentialBidAmount: payload.confidentialBidAmount,
      })
    );
    return { encryptedReceipt: stub.encrypted, nonce: stub.nonce, tag: stub.tag };
  }
  const apiKey = await secretProvider.getSecret(config.API_KEY_SECRET_NAME);
  const baseUrl = config.CRA_WORKFLOW_URL.replace(/\/$/, "");
  const url = `${baseUrl}${AUCTION_PATH}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Auction CRA submitBid failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as SubmitBidResponse;
  if (typeof json.encryptedReceipt !== "string" || typeof json.nonce !== "string" || typeof json.tag !== "string") {
    throw new Error("Auction CRA response missing encryptedReceipt, nonce, or tag");
  }
  return json;
}

export async function callAuctionCraSettle(
  config: CraConfig,
  secretProvider: SecretProvider,
  payload: SettleAuctionPayload
): Promise<SettleAuctionResponse> {
  if (isAuctionStubEnabled()) {
    const stubWinner =
      process.env.AUCTION_STUB_WINNER_ADDRESS ?? "0x0000000000000000000000000000000000000000";
    const stubConfidentialBidAmount =
      process.env.AUCTION_STUB_WINNER_CONFIDENTIAL_AMOUNT ?? "0";
    const winnerHash = computeWinnerHash(payload.workflowId, stubWinner);
    const stub = await stubEncrypt(
      secretProvider,
      config.AES_ENCRYPTION_KEY_SECRET_NAME,
      JSON.stringify({ winner: stubWinner, amount: "0", workflowId: payload.workflowId })
    );
    return {
      encryptedData: stub.encrypted,
      nonce: stub.nonce,
      tag: stub.tag,
      winnerAddress: stubWinner,
      winnerHash,
      confidentialBidAmount: stubConfidentialBidAmount,
    };
  }
  const apiKey = await secretProvider.getSecret(config.API_KEY_SECRET_NAME);
  const baseUrl = config.CRA_WORKFLOW_URL.replace(/\/$/, "");
  const url = `${baseUrl}${AUCTION_PATH}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Auction CRA settleAuction failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as SettleAuctionResponse & { winnerHash?: string };
  if (
    typeof json.encryptedData !== "string" ||
    typeof json.nonce !== "string" ||
    typeof json.tag !== "string" ||
    typeof json.winnerAddress !== "string" ||
    typeof json.winnerHash !== "string" ||
    typeof json.confidentialBidAmount !== "string"
  ) {
    throw new Error(
      "Auction CRA response missing encryptedData, nonce, tag, winnerAddress, winnerHash, or confidentialBidAmount"
    );
  }
  return {
    encryptedData: json.encryptedData,
    nonce: json.nonce,
    tag: json.tag,
    winnerAddress: json.winnerAddress,
    winnerHash: json.winnerHash,
    confidentialBidAmount: json.confidentialBidAmount,
  };
}

/** winnerHash = keccak256(workflowId, winnerAddress) for binding and validation. */
export function computeWinnerHash(workflowId: number, winnerAddress: string): string {
  return keccak256(solidityPacked(["uint256", "address"], [BigInt(workflowId), winnerAddress]));
}
