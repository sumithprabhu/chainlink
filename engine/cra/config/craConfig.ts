import "dotenv/config";
import { z } from "zod";

const hex64 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex chars (32 bytes), no 0x prefix");

const craEnvSchema = z.object({
  CRA_WORKFLOW_URL: z.string().url(),
  API_KEY_SECRET_NAME: z.string().min(1, "API_KEY_SECRET_NAME is required"),
  AES_ENCRYPTION_KEY_SECRET_NAME: z.string().min(1, "AES_ENCRYPTION_KEY_SECRET_NAME is required"),
  ENGINE_API_KEY: z.string().optional(),
  ENGINE_AES_ENCRYPTION_KEY: hex64.optional(),
});

export type CraConfig = z.infer<typeof craEnvSchema>;

export function loadCraConfig(): CraConfig {
  const parsed = craEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid CRA config: ${msg}`);
  }
  return parsed.data;
}
