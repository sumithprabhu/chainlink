import { createDecipheriv } from "crypto";

/**
 * Decrypt AES-GCM payload.
 * In production decryption must occur outside execution engine.
 * This utility is for demonstration / off-engine verification only.
 */
export function decryptAESGCM(
  encryptedData: Buffer | string,
  nonce: Buffer | string,
  tag: Buffer | string,
  key: Buffer | string
): Buffer {
  const enc = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData, "hex");
  const iv = Buffer.isBuffer(nonce) ? nonce : Buffer.from(nonce, "hex");
  const authTag = Buffer.isBuffer(tag) ? tag : Buffer.from(tag, "hex");
  const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key, "hex");
  const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}
