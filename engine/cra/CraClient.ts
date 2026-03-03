/**
 * CRA client: calls Chainlink CRA / CRE gateway, handles response format,
 * validates encrypted payload structure. No decryption in engine.
 */
import { createHash } from "crypto";
import { Wallet } from "ethers";

export interface CraClientConfig {
  endpointUrl: string;
  workflowId: string;
  /** Private key for JWT (hex with or without 0x). Used when endpoint is CRE gateway. */
  privateKey: string;
  /** Request timeout in ms. */
  timeoutMs: number;
}

export interface EncryptedPayload {
  encryptedData: string;
  nonce: string;
  tag: string;
}

const HEX_REGEX = /^[0-9a-fA-F]+$/;

function base64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function toSortedCanonicalJson(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(toSortedCanonicalJson).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + toSortedCanonicalJson((obj as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

/**
 * Validate and normalize encrypted payload from CRA.
 * encryptedData: even-length hex; nonce: 24 hex (12 bytes); tag: 32 hex (16 bytes).
 */
export function validateEncryptedPayload(raw: unknown): EncryptedPayload {
  if (raw == null || typeof raw !== "object") {
    throw new Error("CRA response: encrypted payload must be an object");
  }
  const o = raw as Record<string, unknown>;
  const encryptedData = o.encryptedData;
  const nonce = o.nonce;
  const tag = o.tag;
  if (typeof encryptedData !== "string" || typeof nonce !== "string" || typeof tag !== "string") {
    throw new Error("CRA response: encryptedData, nonce, and tag must be strings");
  }
  const enc = encryptedData.startsWith("0x") ? encryptedData.slice(2) : encryptedData;
  const nonceClean = nonce.startsWith("0x") ? nonce.slice(2) : nonce;
  const tagClean = tag.startsWith("0x") ? tag.slice(2) : tag;
  if (!HEX_REGEX.test(enc) || enc.length % 2 !== 0) {
    throw new Error("CRA response: encryptedData must be even-length hex");
  }
  if (!HEX_REGEX.test(nonceClean) || nonceClean.length !== 24) {
    throw new Error("CRA response: nonce must be 12 bytes (24 hex chars)");
  }
  if (!HEX_REGEX.test(tagClean) || tagClean.length !== 32) {
    throw new Error("CRA response: tag must be 16 bytes (32 hex chars)");
  }
  return {
    encryptedData: enc,
    nonce: nonceClean,
    tag: tagClean,
  };
}

/**
 * Create JWT for CRE gateway (ETH alg, digest of request body, iss=address, iat/exp, jti, signature).
 */
async function createCreJwt(wallet: Wallet, requestBodySorted: string): Promise<string> {
  const digest = "0x" + createHash("sha256").update(requestBodySorted, "utf8").digest("hex");
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 300; // 5 min max
  const jti = crypto.randomUUID();
  const payload = {
    digest,
    iss: await wallet.getAddress(),
    iat,
    exp,
    jti,
  };
  const header = { alg: "ETH", typ: "JWT" };
  const headerB64 = base64urlEncode(Buffer.from(JSON.stringify(header), "utf8"));
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const message = `${headerB64}.${payloadB64}`;
  const sig = await wallet.signMessage(message);
  const sigHex = sig.startsWith("0x") ? sig.slice(2) : sig;
  const sigBytes = Buffer.from(sigHex, "hex");
  const sigB64 = base64urlEncode(sigBytes);
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

export class CraClient {
  constructor(private readonly config: CraClientConfig) {}

  /**
   * Invoke CRA workflow with input; return encrypted payload.
   * Throws on failure (no silent fallback).
   */
  async execute(input: { workflowId: string; inputHash: string }): Promise<EncryptedPayload> {
    const params = {
      input: {
        workflowId: input.workflowId,
        inputHash: input.inputHash,
      },
      workflow: {
        workflowID: this.config.workflowId.replace(/^0x/, ""),
      },
    };
    const body = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      jsonrpc: "2.0",
      method: "workflows.execute",
      params,
    };
    const sortedBody = toSortedCanonicalJson(body);
    const wallet = new Wallet(this.config.privateKey);
    const jwt = await createCreJwt(wallet, sortedBody);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let res: Response;
    try {
      res = await fetch(this.config.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: sortedBody,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`CRA request failed: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new Error(`CRA response not JSON: status ${res.status}`);
    }

    const rpc = json as { error?: { code?: number; message?: string }; result?: Record<string, unknown> };
    if (rpc.error) {
      throw new Error(`CRA error: ${rpc.error.message ?? rpc.error.code ?? "unknown"}`);
    }

    const result = rpc.result;
    if (!result || typeof result !== "object") {
      throw new Error("CRA response: missing result");
    }

    const status = result.status as string | undefined;
    if (status === "ACCEPTED" && !result.output) {
      throw new Error(
        "CRA returned ACCEPTED without output; sync execution result not available. " +
          "Use a workflow that returns encrypted payload in result or poll execution result."
      );
    }

    const output = result.output ?? result;
    const payload = typeof output === "object" && output !== null ? output : undefined;
    if (!payload) {
      throw new Error("CRA response: no encrypted output (encryptedData, nonce, tag)");
    }

    return validateEncryptedPayload(payload);
  }
}
