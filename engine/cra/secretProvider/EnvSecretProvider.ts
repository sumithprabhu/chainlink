import type { SecretProvider } from "./SecretProvider";

/**
 * Resolves secrets from process.env (local / demo).
 * Not Vault DON; use VaultDonSecretProvider in production.
 * Optional fallbacks: map secret name -> env var name (e.g. ENGINE_API_KEY).
 */
export class EnvSecretProvider implements SecretProvider {
  constructor(private readonly fallbacks: Record<string, string> = {}) {}

  async getSecret(secretName: string): Promise<string> {
    const envVar = this.fallbacks[secretName] ?? secretName;
    const value = process.env[envVar] ?? process.env[secretName];
    if (value == null || value === "") {
      throw new Error(`Missing secret for name: ${secretName}`);
    }
    return value;
  }
}
