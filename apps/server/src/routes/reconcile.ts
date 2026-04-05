import { Hono } from "hono";
import { db } from "@my-better-t-app/db";
import { chunks } from "@my-better-t-app/db/schema";
import { eq, sql } from "drizzle-orm";
import { chunkExistsInBucket, uploadToBucket, ensureBucket } from "../lib/bucket.js";

export const reconcileRoute = new Hono();

/**
 * FIX: Process MinIO existence checks in batches of 50 (concurrent) rather
 * than Promise.all() over the entire table. This prevents OOM at scale
 * and avoids flooding MinIO with thousands of simultaneous connections.
 */
async function checkInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// GET /api/reconcile — find DB-acked chunks that are missing from bucket
reconcileRoute.get("/", async (c) => {
  const ackedChunks = await db
    .select()
    .from(chunks)
    .where(eq(chunks.isAcked, true));

  // FIX: Batch 50 concurrent checks at a time instead of Promise.all on all rows
  const results = await checkInBatches(ackedChunks, 50, async (chunk) => {
    const inBucket = await chunkExistsInBucket(chunk.bucketKey);
    return { ...chunk, inBucket };
  });

  const missing = results.filter((r) => !r.inBucket);
  const consistent = results.filter((r) => r.inBucket);

  return c.json({
    total: ackedChunks.length,
    consistent: consistent.length,
    missing: missing.length,
    missingChunks: missing.map((m) => ({
      chunkId: m.chunkId,
      bucketKey: m.bucketKey,
      recordingId: m.recordingId,
      sequenceNumber: m.sequenceNumber,
    })),
  });
});

// POST /api/reconcile/repair — client sends OPFS data for missing chunks
reconcileRoute.post("/repair", async (c) => {
  const body = await c.req.json<{ chunkId: string; data: string }>();
  const { chunkId, data } = body;

  if (!chunkId || !data) {
    return c.json({ error: "chunkId and data required" }, 400);
  }

  // Find the chunk record
  const [chunk] = await db.select().from(chunks).where(eq(chunks.chunkId, chunkId));

  if (!chunk) {
    return c.json({ error: "Chunk not found in DB" }, 404);
  }

  try {
    await ensureBucket();
    const buffer = Buffer.from(data, "base64");
    await uploadToBucket(chunk.bucketKey, buffer);

    // FIX: Also increment uploadAttempts on repair (consistent audit trail)
    await db
      .update(chunks)
      .set({
        isAcked: true,
        ackedAt: new Date(),
        uploadAttempts: sql`${chunks.uploadAttempts} + 1`,
      })
      .where(eq(chunks.chunkId, chunkId));

    return c.json({ ok: true, chunkId, repaired: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repair failed";
    return c.json({ ok: false, error: message }, 500);
  }
});
