import { describe, expect } from "bun:test";
import { newTestRuntime, test } from "@chainlink/cre-sdk/test";
import { onHttpTrigger, initWorkflow } from "./main";
import type { Config } from "./main";

const config: Config = {
  apiKeySecretName: "apiKey",
  aesEncryptionKeySecretName: "san_marino_aes_gcm_encryption_key",
};

describe("initWorkflow", () => {
  test("returns one handler with HTTP trigger", async () => {
    const handlers = initWorkflow(config);

    expect(handlers).toBeArray();
    expect(handlers).toHaveLength(1);
    expect(handlers[0].trigger.config).toBeDefined();
  });
});

describe("onHttpTrigger", () => {
  test("expects workflowId and inputHash in payload", () => {
    const runtime = newTestRuntime();
    runtime.config = config;
    const emptyPayload = { input: new Uint8Array(0) };
    expect(() => onHttpTrigger(runtime, emptyPayload as any)).toThrow("payload is empty");
  });

  test("throws when input lacks workflowId or inputHash", () => {
    const runtime = newTestRuntime();
    runtime.config = config;
    const badPayload = { input: new TextEncoder().encode(JSON.stringify({ workflowId: "1" })) };
    expect(() => onHttpTrigger(runtime, badPayload as any)).toThrow("workflowId and inputHash");
  });
});
