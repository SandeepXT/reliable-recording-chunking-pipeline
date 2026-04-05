import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { uploadToBucket, ensureBucket } from "@/lib/server/bucket";
import { transcribeBuffer } from "@/lib/server/transcribe";
import { chunks, recordings } from "@my-better-t-app/db/schema";

const uploadSchema = z.object({
  chunkId: z.string().min(1),
  recordingId: z.string().uuid().optional(),
  sequenceNumber: z.number().int().min(0),
  durationSeconds: z.number().min(0).default(0),
  data: z.string().min(1), // base64 WAV
});

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  // Body size guard — 10MB
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Request body too large. Max 10MB." }, { status: 413 });
  }

  try {
    const body = await req.json();
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });

    const { chunkId, recordingId, sequenceNumber, durationSeconds, data } = parsed.data;
    const bucketKey = `recordings/${recordingId ?? "default"}/${chunkId}.wav`;
    const buffer = Buffer.from(data, "base64");

    await ensureBucket();
    await uploadToBucket(bucketKey, buffer);

    const db = getDb();
    const [chunk] = await db
      .insert(chunks)
      .values({
        chunkId,
        recordingId: recordingId ?? null,
        sequenceNumber,
        sizeBytes: buffer.length,
        durationSeconds: Math.round(durationSeconds),
        bucketKey,
        isAcked: true,
        ackedAt: new Date(),
        uploadAttempts: 1,
        transcriptStatus: "pending",
      })
      .onConflictDoUpdate({
        target: chunks.chunkId,
        set: {
          isAcked: true,
          ackedAt: new Date(),
          uploadAttempts: sql`${chunks.uploadAttempts} + 1`,
          sizeBytes: buffer.length,
        },
      })
      .returning();

    if (recordingId) {
      await db
        .update(recordings)
        .set({
          totalChunks: sql`(SELECT COUNT(*) FROM chunks WHERE recording_id = ${recordingId} AND is_acked = true)`,
          updatedAt: new Date(),
        })
        .where(eq(recordings.id, recordingId));
    }

    // Fire-and-forget transcription
    if (chunk) {
      void transcribeChunkAsync(chunk.chunkId, buffer);
    }

    return NextResponse.json({ ok: true, chunkId, bucketKey, chunk });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), chunkId: "unknown" }, { status: 500 });
  }
}

async function transcribeChunkAsync(chunkId: string, wavBuffer: Buffer): Promise<void> {
  const db = getDb();
  try {
    await db.update(chunks).set({ transcriptStatus: "processing" }).where(eq(chunks.chunkId, chunkId));

    const result = await transcribeBuffer(wavBuffer, chunkId);

    if (result === null) {
      await db.update(chunks).set({ transcriptStatus: "skipped" }).where(eq(chunks.chunkId, chunkId));
      return;
    }

    await db
      .update(chunks)
      .set({ transcript: result.text, transcriptConfidence: result.confidence, transcriptStatus: "done" })
      .where(eq(chunks.chunkId, chunkId));

    const [chunkRow] = await db
      .select({ recordingId: chunks.recordingId })
      .from(chunks)
      .where(eq(chunks.chunkId, chunkId));

    if (chunkRow?.recordingId) {
      await assembleRecordingTranscript(chunkRow.recordingId);
    }
  } catch (err) {
    console.error(`[transcribe] chunk ${chunkId} failed:`, err);
    await db.update(chunks).set({ transcriptStatus: "failed" }).where(eq(chunks.chunkId, chunkId)).catch(() => {});
  }
}

async function assembleRecordingTranscript(recordingId: string): Promise<void> {
  const db = getDb();
  const allChunks = await db
    .select({ sequenceNumber: chunks.sequenceNumber, transcript: chunks.transcript, transcriptStatus: chunks.transcriptStatus })
    .from(chunks)
    .where(eq(chunks.recordingId, recordingId))
    .orderBy(chunks.sequenceNumber);

  const fullText = allChunks
    .filter((c) => c.transcript)
    .map((c) => c.transcript)
    .join(" ")
    .trim();

  const allDone = allChunks.every(
    (c) => c.transcriptStatus === "done" || c.transcriptStatus === "skipped" || c.transcriptStatus === "failed"
  );

  await db
    .update(recordings)
    .set({ transcript: fullText || null, transcriptStatus: allDone ? "done" : "processing", updatedAt: new Date() })
    .where(eq(recordings.id, recordingId));
}
