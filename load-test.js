import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ── Custom metrics ───────────────────────────────────────────────────────────
const uploadSuccess = new Counter("upload_success");
const uploadFailed = new Counter("upload_failed");
const errorRate = new Rate("error_rate");
const uploadDuration = new Trend("upload_duration_ms", true);

// ── Test configuration ───────────────────────────────────────────────────────
// Target: 300,000 requests in 60 seconds → 5,000 req/s
export const options = {
  scenarios: {
    chunk_uploads: {
      executor: "constant-arrival-rate",
      rate: 5000,           // 5,000 requests per second
      timeUnit: "1s",
      duration: "1m",       // 60 seconds → 300,000 total requests
      preAllocatedVUs: 500,
      maxVUs: 1000,
    },
  },
  thresholds: {
    // 95% of requests must complete under 500ms
    http_req_duration: ["p(95)<500"],
    // Error rate must stay under 1%
    error_rate: ["rate<0.01"],
    // All uploads should succeed
    upload_success: ["count>290000"],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a 1KB WAV-shaped payload (valid WAV header + silence) */
function makeWavBase64() {
  // 1 KB of "x" simulates audio data — replace with real WAV bytes in production
  return btoa("x".repeat(1024));
}

// ── Main test function ───────────────────────────────────────────────────────
export default function () {
  const chunkId = `chunk-${__VU}-${__ITER}-${Date.now()}`;
  const payload = JSON.stringify({
    chunkId,
    sequenceNumber: __ITER,
    durationSeconds: 5,
    data: makeWavBase64(),
  });

  const start = Date.now();
  const res = http.post("http://localhost:3000/api/chunks/upload", payload, {
    headers: { "Content-Type": "application/json" },
    timeout: "10s",
  });
  const elapsed = Date.now() - start;

  uploadDuration.add(elapsed);

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "ok: true": (r) => {
      try {
        return (JSON.parse(r.body) as { ok: boolean }).ok === true;
      } catch {
        return false;
      }
    },
  });

  if (ok) {
    uploadSuccess.add(1);
    errorRate.add(0);
  } else {
    uploadFailed.add(1);
    errorRate.add(1);
  }
}

/** Setup: verify server is reachable before starting */
export function setup() {
  const res = http.get("http://localhost:3000/health");
  if (res.status !== 200) {
    throw new Error(`Server not ready — health check returned ${res.status}`);
  }
  return {};
}

/** Teardown: print summary */
export function teardown() {
  console.log("Load test complete. Check k6 output for metrics.");
  console.log("Run reconcile to verify no data loss:");
  console.log("  curl http://localhost:3000/api/reconcile");
}
