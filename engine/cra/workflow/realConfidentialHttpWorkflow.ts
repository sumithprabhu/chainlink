/**
 * Real Chainlink CRA Confidential HTTP workflow.
 * Uses CraClient to invoke CRE gateway; returns encrypted payload from CRA.
 * No decryption in engine. Secrets are resolved inside the DON (workflow uses Vault references).
 */
import type { CraConfig } from "../config/craConfig";
import { CraClient, validateEncryptedPayload } from "../CraClient";

export interface ConfidentialWorkflowInput {
  workflowId: string;
  inputHash: string;
}

export interface ConfidentialWorkflowOutput {
  encryptedData: string;
  nonce: string;
  tag: string;
}

export interface RealConfidentialHttpWorkflowConfig {
  craConfig: CraConfig;
  privateKey: string;
  timeoutMs: number;
}

/**
 * Invoke real CRA workflow via CRE gateway.
 * Expects CRA_ENDPOINT_URL and CRA_WORKFLOW_ID when USE_REAL_CRA.
 * Returns encrypted payload; throws on failure (no mock fallback).
 */
export async function runRealConfidentialHttpWorkflow(
  config: RealConfidentialHttpWorkflowConfig,
  input: ConfidentialWorkflowInput
): Promise<ConfidentialWorkflowOutput> {
  const endpointUrl = config.craConfig.CRA_ENDPOINT_URL;
  const workflowId = config.craConfig.CRA_WORKFLOW_ID;
  if (!endpointUrl || !workflowId) {
    throw new Error("Real CRA requires CRA_ENDPOINT_URL and CRA_WORKFLOW_ID");
  }

  const client = new CraClient({
    endpointUrl,
    workflowId: workflowId.replace(/^0x/, ""),
    privateKey: config.privateKey,
    timeoutMs: config.timeoutMs,
  });

  const payload = await client.execute({
    workflowId: input.workflowId,
    inputHash: input.inputHash,
  });

  return {
    encryptedData: payload.encryptedData,
    nonce: payload.nonce,
    tag: payload.tag,
  };
}

export { validateEncryptedPayload };
