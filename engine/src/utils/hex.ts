/**
 * Normalize hex string for consistent encoding across environments.
 * Prevents environment inconsistencies in commitment and attestation.
 */
export function normalizeHex(value: string): string {
  const stripped = value.replace(/\s/g, "");
  const raw = stripped.startsWith("0x") ? stripped.slice(2) : stripped;
  if (raw.length % 2 !== 0) {
    throw new Error("Hex value must have even length");
  }
  if (!/^[0-9a-fA-F]*$/.test(raw)) {
    throw new Error("Hex value must contain only 0-9, a-f, A-F");
  }
  return "0x" + raw.toLowerCase();
}
