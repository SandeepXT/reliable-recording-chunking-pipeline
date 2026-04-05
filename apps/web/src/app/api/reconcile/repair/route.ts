import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { uploadToBucket, ensureBucket } from "@/lib/server/bucket";
import { chunks } from "@my-better-t-app/db/schema";

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  try {
    const body = await req.json() as { chunkId: string; data: string };
    const { chunkId, data } = body;

    if (!chunkId || !data)
      return NextResponse.json({ error: "chunkId and data required" }, { status: 400 });

    const db = getDb();
    const [chunk] = await db.select().from(chunks).where(eq(chunks.chunkId, chunkId));
    if (!chunk) return NextResponse.json({ error: "Chunk not found in DB" }, { status: 404 });

    await ensureBucket();
    const buffer = Buffer.from(data, "base64");
    await uploadToBucket(chunk.bucketKey, buffer);

    await db
      .update(chunks)
      .set({ isAcked: true, ackedAt: new Date(), uploadAttempts: sql`${chunks.uploadAttempts} + 1` })
      .where(eq(chunks.chunkId, chunkId));

    return NextResponse.json({ ok: true, chunkId, repaired: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
