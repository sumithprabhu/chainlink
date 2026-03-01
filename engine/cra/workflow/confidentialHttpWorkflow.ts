import { createCipheriv, randomBytes } from "crypto";
import type { CraConfig } from "../config/craConfig";

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
 * - Resolve API key (from Vault DON / reserved key; here simulated via env).
 * - POST to private endpoint with workflowId and inputHash.
 * - Encrypt JSON response with AES-GCM.
 * - Return encrypted payload (no decryption in engine).
 */
export async function runConfidentialHttpWorkflow(
  config: CraConfig,
  input: ConfidentialWorkflowInput
): Promise<ConfidentialWorkflowOutput> {
  const apiKey =
    process.env.ENGINE_API_KEY ??
    (process.env[config.API_KEY_SECRET_NAME] as string | undefined);
  const aesKeyHex =
    process.env.ENGINE_AES_ENCRYPTION_KEY ??
    (process.env[config.AES_ENCRYPTION_KEY_SECRET_NAME] as string | undefined);
  if (!apiKey || !aesKeyHex) {
    throw new Error("Missing API key or AES key (set ENGINE_API_KEY / ENGINE_AES_ENCRYPTION_KEY for local)");
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
  }).catch(() => null);

  const mockResponse =
    res?.ok && res?.headers.get("content-type")?.includes("json")
      ? await res.json()
      : { score: 0, result: "mock" };

  const plaintext = JSON.stringify({
    score: mockResponse.score ?? 0,
    result: mockResponse.result ?? "mock",
  });
  const key = Buffer.from(aesKeyHex, "hex");
  if (key.length !== 32) throw new Error("AES key must be 32 bytes (64 hex chars)");
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
