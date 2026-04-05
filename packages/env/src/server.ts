import { z } from "zod";

// Simple typed env — no @t3-oss dependency needed for server routes in Next.js
// Next.js automatically loads .env.local in dev; Vercel injects env vars in prod

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NODE_ENV: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
  API_SECRET: process.env.API_SECRET,
  BUCKET_ENDPOINT: process.env.BUCKET_ENDPOINT,
  BUCKET_REGION: process.env.BUCKET_REGION ?? "auto",
  BUCKET_ACCESS_KEY: process.env.BUCKET_ACCESS_KEY ?? "minioadmin",
  BUCKET_SECRET_KEY: process.env.BUCKET_SECRET_KEY ?? "minioadmin",
  BUCKET_NAME: process.env.BUCKET_NAME ?? "recordings",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
} as const;
