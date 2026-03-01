import type { SecretProvider } from "./SecretProvider";

/**
 * Placeholder for resolving secrets from Chainlink Vault DON.
 * TODO: Wire to Chainlink DON reserved key / Vault API for production.
 * @see https://docs.chain.link/chainlink-functions/resources/secrets-management
 * @see https://docs.chain.link/chainlink-automation
 */
export class VaultDonSecretProvider implements SecretProvider {
  async getSecret(_secretName: string): Promise<string> {
    throw new Error(
      "VaultDonSecretProvider not implemented: wire to Chainlink DON / Vault for production. " +
        "See Chainlink docs for secrets management."
    );
  }
}
