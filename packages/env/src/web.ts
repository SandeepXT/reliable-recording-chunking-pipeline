import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    // Optional: set in Vercel env vars if the server has auth enabled
    NEXT_PUBLIC_API_TOKEN: z.string().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_API_TOKEN: process.env.NEXT_PUBLIC_API_TOKEN,
  },
  emptyStringAsUndefined: true,
});
