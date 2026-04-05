import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { chunks } from "@my-better-t-app/db/schema";

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const recordingId = searchParams.get("recordingId");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);
    const offset = Number(searchParams.get("offset") ?? 0);

    if (recordingId) {
      const result = await db
        .select()
        .from(chunks)
        .where(eq(chunks.recordingId, recordingId))
        .orderBy(chunks.sequenceNumber)
        .limit(limit)
        .offset(offset);
      return NextResponse.json(result);
    }

    const result = await db.select().from(chunks).orderBy(desc(chunks.createdAt)).limit(limit).offset(offset);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
