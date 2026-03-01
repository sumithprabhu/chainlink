import "dotenv/config";
import { z } from "zod";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

const envSchema = z.object({
  RPC_URL: z.string().url(),
  PRIVATE_KEY: z.string().min(1, "PRIVATE_KEY is required"),
  CONTRACT_ADDRESS: addressSchema,
  CHAIN_ID: z.coerce.number().int().positive(),
  MIN_CONFIRMATIONS: z.coerce.number().int().min(0).default(2),
  MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(3),
  WORKFLOW_CREATOR_ALLOWLIST: z
    .string()
    .optional()
    .default("")
    .transform((s) =>
      s ? s.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean) : []
    )
    .pipe(z.array(z.string().regex(/^0x[a-fa-f0-9]{40}$/))),
  EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
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
