import { solidityPacked, getBytes } from "ethers";
import type { Logger } from "pino";

/** Proof layout: workflowHash (32) | commitmentHash (32) | nonce (32) = 96 bytes. */
const PROOF_LENGTH_BYTES = 96;

/**
 * Attestation service: generate stub proofs and validate structure.
 * Interface designed to later support: external enclave call, async verification, attestation validation pre-submit.
 */
export class AttestationService {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: "AttestationService" });
  }

  /**
   * Generate attestation proof (stub: packed bytes).
   * Later: can delegate to external enclave or async verification.
   */
  generate(workflowHash: string, commitmentHash: string, nonce: bigint): string {
    const proof = solidityPacked(
      ["bytes32", "bytes32", "uint256"],
      [workflowHash, commitmentHash, nonce]
    );
    this.logger.debug({ status: "BUILDING_ATTESTATION" }, "Generated attestation proof");
    return proof;
  }

  /**
   * Validate proof structure (length and layout).
   * Use before submit; later can add signature / TEE quote checks.
   */
  validateStructure(proof: string): boolean {
    try {
      const bytes = getBytes(proof);
      if (bytes.length !== PROOF_LENGTH_BYTES) {
        this.logger.warn({ status: "BUILDING_ATTESTATION" }, "Invalid proof length");
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
