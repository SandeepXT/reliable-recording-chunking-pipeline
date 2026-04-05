import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { chunkExistsInBucket } from "@/lib/server/bucket";
import { chunks } from "@my-better-t-app/db/schema";

async function checkInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  try {
    const db = getDb();
    const ackedChunks = await db.select().from(chunks).where(eq(chunks.isAcked, true));

    const results = await checkInBatches(ackedChunks, 50, async (chunk) => {
      const inBucket = await chunkExistsInBucket(chunk.bucketKey);
      return { ...chunk, inBucket };
    });

    const missing = results.filter((r) => !r.inBucket);
    const consistent = results.filter((r) => r.inBucket);

    return NextResponse.json({
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
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
