/**
 * This module represents the Confidential Compute Layer.
 * Secrets must be provided via SecretProvider. No plaintext data should exit this layer in production.
 */
import { createCipheriv, randomBytes } from "crypto";
import type { CraConfig } from "../config/craConfig";
import type { SecretProvider } from "../secretProvider/SecretProvider";

export interface ConfidentialWorkflowInput {
  workflowId: string;
  inputHash: string;
}

export interface ConfidentialWorkflowOutput {
  encryptedData: string;
  nonce: string;
  tag: string;
}

/**
 * Chainlink CRA-style confidential HTTP workflow:
 * - Resolve API key and AES key via SecretProvider (Env or Vault DON).
 * - POST to private endpoint with workflowId and inputHash.
 * - Encrypt JSON response with AES-GCM (12-byte random nonce).
 * - Return encrypted payload (no decryption in engine).
 *
 * Determinism: Confidential HTTP result is inherently non-deterministic (random nonce).
 * Idempotency is enforced by skipping execution when workflow already has a finalized
 * record, not by output reproducibility.
 */
export async function runConfidentialHttpWorkflow(
  config: CraConfig,
  secretProvider: SecretProvider,
  input: ConfidentialWorkflowInput
): Promise<ConfidentialWorkflowOutput> {
  const apiKey = await secretProvider.getSecret(config.API_KEY_SECRET_NAME);
  const aesKeyHex = await secretProvider.getSecret(config.AES_ENCRYPTION_KEY_SECRET_NAME);
  const key = Buffer.from(aesKeyHex, "hex");
  if (key.length !== 32) {
    throw new Error("AES key must be 32 bytes (64 hex chars)");
  }

  const url = `${config.CRA_WORKFLOW_URL.replace(/\/$/, "")}/private-score`;
  const body = { workflowId: input.workflowId, inputHash: input.inputHash };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`CRA HTTP ${res.status}: ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type");
  if (!contentType?.includes("json")) {
    throw new Error("CRA response is not JSON");
  }
  const json = await res.json();
  const plaintext = JSON.stringify({
    score: (json as { score?: number }).score ?? 0,
    result: (json as { result?: string }).result ?? "ok",
  });
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedData: encrypted.toString("hex"),
    nonce: nonce.toString("hex"),
    tag: tag.toString("hex"),
  };
}
