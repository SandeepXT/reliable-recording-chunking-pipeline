import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Auth — required in production, optional (bypass) in dev
    API_SECRET: z.string().min(32).optional(),
    // Bucket (MinIO / S3)
    BUCKET_ENDPOINT: z.string().default("localhost"),
    BUCKET_PORT: z.coerce.number().default(9000),
    BUCKET_USE_SSL: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    BUCKET_ACCESS_KEY: z.string().default("minioadmin"),
    BUCKET_SECRET_KEY: z.string().default("minioadmin"),
    BUCKET_NAME: z.string().default("recordings"),
    // Transcript — OpenAI Whisper API key (optional: skips transcription if absent)
    OPENAI_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
