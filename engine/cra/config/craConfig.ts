import "dotenv/config";
import { z } from "zod";

const craEnvSchema = z.object({
  CRA_WORKFLOW_URL: z.string().url(),
  API_KEY_SECRET_NAME: z.string().min(1, "API_KEY_SECRET_NAME is required"),
  AES_ENCRYPTION_KEY_SECRET_NAME: z.string().min(1, "AES_ENCRYPTION_KEY_SECRET_NAME is required"),
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
