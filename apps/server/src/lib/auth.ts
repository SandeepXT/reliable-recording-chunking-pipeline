import type { Context, Next } from "hono";
import { env } from "@my-better-t-app/env/server";

/**
 * Bearer auth middleware.
 * - In development with no API_SECRET set: passes through with a warning.
 * - In production (NODE_ENV=production) with no API_SECRET: rejects with 500
 *   at startup time (see index.ts startup check).
 * - Otherwise: validates the Authorization: Bearer <token> header.
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  // Dev bypass when no secret configured
  if (!env.API_SECRET) {
    if (env.NODE_ENV === "production") {
      return c.json({ error: "Server misconfigured: API_SECRET not set" }, 500);
    }
    // Dev mode — allow through
    return next();
  }

  const authHeader = c.req.header("Authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return c.json({ error: "Missing or malformed Authorization header" }, 401);
  }

  // Constant-time comparison to prevent timing attacks
  const expected = env.API_SECRET;
  if (token.length !== expected.length) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
}
