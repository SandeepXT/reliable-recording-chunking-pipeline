import { env } from "@my-better-t-app/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { chunksRoute } from "./routes/chunks.js";
import { recordingsRoute } from "./routes/recordings.js";
import { reconcileRoute } from "./routes/reconcile.js";
import { ensureBucket } from "./lib/bucket.js";
import { requireAuth } from "./lib/auth.js";
import { rateLimiter } from "./lib/rate-limit.js";

// ── Production startup guard ──────────────────────────────────────────────────
if (env.NODE_ENV === "production" && !env.API_SECRET) {
  console.error("FATAL: API_SECRET must be set in production. Exiting.");
  process.exit(1);
}

const app = new Hono();

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);

// ── Auth — all /api/* routes require a valid Bearer token ─────────────────────
app.use("/api/*", requireAuth);

// ── Rate limiting — tightest on the upload endpoint ──────────────────────────
app.use(
  "/api/chunks/upload",
  rateLimiter({
    windowMs: 60_000, // 1 minute
    max: 120,         // 120 uploads/min per IP (~1 chunk every 500ms — well above normal use)
  }),
);

// Looser limit on read/reconcile endpoints
app.use(
  "/api/*",
  rateLimiter({
    windowMs: 60_000,
    max: 600, // 600 read requests/min per IP
  }),
);

// ── Body size guard ───────────────────────────────────────────────────────────
app.use(
  "/api/chunks/*",
  bodyLimit({
    maxSize: 10 * 1024 * 1024, // 10MB — base64 of a 5s 16kHz WAV is ~640KB
    onError: (c) => c.json({ error: "Request body too large. Max 10MB." }, 413),
  }),
);

// ── Global error handler (no stack traces in production) ──────────────────────
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = (err as { status?: number }).status ?? 500;
  if (env.NODE_ENV !== "production") console.error("[ERROR]", err);
  return c.json({ ok: false, error: message }, status as 400 | 500);
});

// ── Health (unauthenticated — used by load balancers) ────────────────────────
app.get("/", (c) => c.json({ ok: true, service: "recording-pipeline", ts: Date.now() }));
app.get("/health", (c) =>
  c.json({ ok: true, service: "recording-pipeline", ts: Date.now() }),
);

// ── API routes ────────────────────────────────────────────────────────────────
app.route("/api/recordings", recordingsRoute);
app.route("/api/chunks", chunksRoute);
app.route("/api/reconcile", reconcileRoute);

// ── Initialize bucket on startup ─────────────────────────────────────────────
ensureBucket()
  .then(() => console.log("✅ Bucket ready"))
  .catch((err: unknown) => {
    console.warn("⚠️  Bucket init failed (MinIO may not be running):", err);
  });

export default app;
