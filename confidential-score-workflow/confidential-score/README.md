# Confidential HTTP Score Workflow for On-Chain Commitment Engine

This workflow is the **Confidential Compute Layer** for the on-chain commitment engine. It receives `workflowId` and `inputHash`, performs a confidential HTTP call, encrypts the response with AES-GCM inside CRA, and returns only `encryptedData`, `nonce`, and `tag`. No plaintext leaves this layer.

---

## A. Architecture Summary

- **Role:** Confidential Compute Layer (CRA).
- **Input:** `workflowId` (string), `inputHash` (string).
- **Behavior:** Performs a confidential HTTP POST; API key and AES key are resolved via **Vault DON** secret references (no env in workflow logic).
- **Response:** Encrypted with AES-GCM inside CRA; returned as `encryptedData`, `nonce`, `tag` (hex).
- **Guarantee:** No plaintext leaves this layer; output is encrypted only. Designed to plug into the on-chain commitment engine.

---

## B. Demo Instructions

### How to simulate

From the **project root** (`confidential-score-workflow`):

```bash
export API_KEY=dummy
export AES_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
cre workflow simulate confidential-score --target staging-settings
```

(Or add `API_KEY` and `AES_KEY` to `.env` in the project root; CRE loads it when running from there.)

### Example input

When prompted for HTTP trigger input:

```json
{"workflowId": "1", "inputHash": "0xabc"}
```

### Expected output

```json
{
  "encryptedData": "...",
  "nonce": "...",
  "tag": "..."
}
```

- `encryptedData`: even-length hex (ciphertext).
- `nonce`: exactly 24 hex chars (12 bytes).
- `tag`: exactly 32 hex chars (16 bytes).

---

## C. Security Notes

- **Secrets:** Resolved via Vault DON secret references (`apiKeySecretName`, `aesEncryptionKeySecretName`). No environment secret usage in workflow logic.
- **Output:** Encrypted only; workflow returns only `encryptedData`, `nonce`, `tag`.
- **Integration:** Designed to plug into the on-chain commitment engine (commitment hash built from these fields off-chain).

---

## Config

- `apiKeySecretName`: Vault DON key for API key (e.g. `"apiKey"`).
- `aesEncryptionKeySecretName`: Must be `"san_marino_aes_gcm_encryption_key"` for CRE response encryption.
- `authorizedPublicKey` (optional): EVM address for HTTP trigger auth in production.

## Install

```bash
cd confidential-score
bun install
```
