import { keccak256 } from "ethers";

/**
 * Produce commitment hash from encoded result.
 * Never store private inputs; only hashed commitment is used on-chain.
 */
export function commitmentHash(encodedResult: string): string {
  return keccak256(encodedResult);
}
