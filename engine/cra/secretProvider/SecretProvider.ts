/**
 * Abstraction for resolving secrets (e.g. API key, AES key).
 * Swap implementation for local (env) vs production (Vault DON).
 */
export interface SecretProvider {
  getSecret(secretName: string): Promise<string>;
}
