import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  RPC_URL: z.string().url(),
  PRIVATE_KEY: z.string().min(1, "PRIVATE_KEY is required"),
  CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "CONTRACT_ADDRESS must be a valid 20-byte address"),
  CHAIN_ID: z.coerce.number().int().positive(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  return parsed.data;
}

export const env = loadEnv();
