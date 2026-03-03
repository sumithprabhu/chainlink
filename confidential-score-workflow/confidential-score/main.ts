import {
  ConfidentialHTTPClient,
  HTTPCapability,
  handler,
  Runner,
  decodeJson,
  ok,
  type Runtime,
  type HTTPPayload,
} from "@chainlink/cre-sdk";

export type Config = {
  apiKeySecretName: string;
  aesEncryptionKeySecretName: string;
  /** EVM address for HTTP trigger authorization (deployment). */
  authorizedPublicKey?: string;
};

export type WorkflowInput = {
  workflowId: string;
  inputHash: string;
};

export type EncryptedOutput = {
  encryptedData: string;
  nonce: string;
  tag: string;
};

const TEST_API_URL = "https://postman-echo.com/post";
const HEX = /^[0-9a-fA-F]+$/;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validateEncryptedOutput(out: EncryptedOutput): EncryptedOutput {
  const enc = out.encryptedData.replace(/^0x/, "");
  const nonce = out.nonce.replace(/^0x/, "");
  const tag = out.tag.replace(/^0x/, "");
  if (!HEX.test(enc) || enc.length % 2 !== 0) {
    throw new Error("Output validation failed: encryptedData must be even-length hex");
  }
  if (!HEX.test(nonce) || nonce.length !== 24) {
    throw new Error("Output validation failed: nonce must be exactly 24 hex chars (12 bytes)");
  }
  if (!HEX.test(tag) || tag.length !== 32) {
    throw new Error("Output validation failed: tag must be exactly 32 hex chars (16 bytes)");
  }
  return out;
}

function parseEncryptedBody(body: Uint8Array): EncryptedOutput {
  if (body.length < 12 + 16) {
    throw new Error("Encrypted response body too short for nonce + tag");
  }
  const nonce = body.subarray(0, 12);
  const tag = body.subarray(body.length - 16);
  const ciphertext = body.subarray(12, body.length - 16);
  return {
    encryptedData: bytesToHex(ciphertext),
    nonce: bytesToHex(nonce),
    tag: bytesToHex(tag),
  };
}

export const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): EncryptedOutput => {
  if (!payload.input || payload.input.length === 0) {
    throw new Error("HTTP trigger payload is empty");
  }

  const inputData = decodeJson(payload.input) as WorkflowInput;
  if (typeof inputData.workflowId !== "string" || typeof inputData.inputHash !== "string") {
    throw new Error("Input must contain workflowId and inputHash strings");
  }

  const confHTTPClient = new ConfidentialHTTPClient();

  const requestBody = JSON.stringify({
    workflowId: inputData.workflowId,
    inputHash: inputData.inputHash,
  });

  const apiKeySecret = runtime.config.apiKeySecretName;
  const aesKeySecret = runtime.config.aesEncryptionKeySecretName;

  const response = confHTTPClient
    .sendRequest(runtime, {
      request: {
        url: TEST_API_URL,
        method: "POST",
        bodyString: requestBody,
        multiHeaders: {
          "Content-Type": { values: ["application/json"] },
          "X-API-Key": { values: [`{{.${apiKeySecret}}}`] },
        },
        encryptOutput: true,
      },
      vaultDonSecrets: [
        { key: apiKeySecret, namespace: "main" },
        { key: aesKeySecret, namespace: "main" },
      ],
    })
    .result();

  if (!ok(response)) {
    throw new Error(`HTTP request failed: ${response.statusCode}`);
  }

  const bodyBytes =
    response.body instanceof Uint8Array
      ? response.body
      : new Uint8Array(Buffer.from((response.body as unknown as string) || "", "base64"));

  const output = parseEncryptedBody(bodyBytes);
  validateEncryptedOutput(output);
  return output;
};

export const initWorkflow = (config: Config, _secretsProvider?: unknown) => {
  const http = new HTTPCapability();
  const authorizedKeys = config.authorizedPublicKey
    ? [{ type: "KEY_TYPE_ECDSA_EVM" as const, publicKey: config.authorizedPublicKey }]
    : [];

  return [
    handler(http.trigger({ authorizedKeys }), onHttpTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
