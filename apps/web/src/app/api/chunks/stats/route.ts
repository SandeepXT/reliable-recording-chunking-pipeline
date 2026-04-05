import { NextRequest, NextResponse } from "next/server";
import { count, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { chunks } from "@my-better-t-app/db/schema";

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  try {
    const db = getDb();
    const [totals] = await db
      .select({
        total: count(),
        acked: sql<number>`COUNT(*) FILTER (WHERE ${chunks.isAcked} = true)`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${chunks.isAcked} = false)`,
        totalBytes: sql<number>`COALESCE(SUM(${chunks.sizeBytes}) FILTER (WHERE ${chunks.isAcked} = true), 0)`,
        totalDurationSeconds: sql<number>`COALESCE(SUM(${chunks.durationSeconds}) FILTER (WHERE ${chunks.isAcked} = true), 0)`,
        transcribed: sql<number>`COUNT(*) FILTER (WHERE ${chunks.transcriptStatus} = 'done')`,
      })
      .from(chunks);

    return NextResponse.json({
      total: Number(totals?.total ?? 0),
      acked: Number(totals?.acked ?? 0),
      pending: Number(totals?.pending ?? 0),
      totalBytes: Number(totals?.totalBytes ?? 0),
      totalDurationSeconds: Number(totals?.totalDurationSeconds ?? 0),
      transcribed: Number(totals?.transcribed ?? 0),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
