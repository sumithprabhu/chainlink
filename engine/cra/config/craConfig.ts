import "dotenv/config";
import { z } from "zod";

const hex64 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex chars (32 bytes), no 0x prefix");

const craEnvSchema = z.object({
  USE_REAL_CRA: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  CRA_WORKFLOW_URL: z.string().url(),
  CRA_ENDPOINT_URL: z.string().url().optional(),
  CRA_WORKFLOW_ID: z.string().optional(),
  VAULT_SECRET_API_KEY_NAME: z.string().optional(),
  VAULT_SECRET_AES_KEY_NAME: z.string().optional(),
  API_KEY_SECRET_NAME: z.string().min(1, "API_KEY_SECRET_NAME is required"),
  AES_ENCRYPTION_KEY_SECRET_NAME: z.string().min(1, "AES_ENCRYPTION_KEY_SECRET_NAME is required"),
  ENGINE_API_KEY: z.string().optional(),
  ENGINE_AES_ENCRYPTION_KEY: hex64.optional(),
}).refine(
  (data) => {
    if (!data.USE_REAL_CRA) return true;
    return Boolean(data.CRA_ENDPOINT_URL && data.CRA_WORKFLOW_ID);
  },
  { message: "When USE_REAL_CRA=true, CRA_ENDPOINT_URL and CRA_WORKFLOW_ID are required", path: ["CRA_ENDPOINT_URL"] }
);

export type CraConfig = z.infer<typeof craEnvSchema>;

export function loadCraConfig(): CraConfig {
  const parsed = craEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid CRA config: ${msg}`);
  }
  return parsed.data;
}
