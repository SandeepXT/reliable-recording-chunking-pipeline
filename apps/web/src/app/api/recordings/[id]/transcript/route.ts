import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { recordings, chunks } from "@my-better-t-app/db/schema";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  const { id } = await params;
  try {
    const db = getDb();
    const [recording] = await db.select().from(recordings).where(eq(recordings.id, id));
    if (!recording) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const chunkSegments = await db
      .select({
        sequenceNumber: chunks.sequenceNumber,
        durationSeconds: chunks.durationSeconds,
        transcript: chunks.transcript,
        transcriptConfidence: chunks.transcriptConfidence,
        transcriptStatus: chunks.transcriptStatus,
      })
      .from(chunks)
      .where(eq(chunks.recordingId, id))
      .orderBy(chunks.sequenceNumber);

    return NextResponse.json({
      recordingId: id,
      recordingName: recording.name,
      transcriptStatus: recording.transcriptStatus,
      fullTranscript: recording.transcript,
      segments: chunkSegments,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
