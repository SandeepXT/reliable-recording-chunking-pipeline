import { Hono } from "hono";
import { db } from "@my-better-t-app/db";
import { chunks, recordings } from "@my-better-t-app/db/schema";
import { eq, desc, sql, count } from "drizzle-orm";
import { z } from "zod";
import { uploadToBucket, ensureBucket } from "../lib/bucket.js";
import { transcribeBuffer } from "../lib/transcribe.js";

export const chunksRoute = new Hono();

const uploadSchema = z.object({
  chunkId: z.string().min(1),
  recordingId: z.string().uuid().optional(),
  sequenceNumber: z.number().int().min(0),
  durationSeconds: z.number().min(0).default(0),
  // WAV audio as base64
  data: z.string().min(1),
});

// POST /api/chunks/upload — upload chunk, ack to DB, trigger async transcription
chunksRoute.post("/upload", async (c) => {
  const body = await c.req.json();
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { chunkId, recordingId, sequenceNumber, durationSeconds, data } = parsed.data;
  const bucketKey = `recordings/${recordingId ?? "default"}/${chunkId}.wav`;
  const buffer = Buffer.from(data, "base64");

  try {
    await ensureBucket();
    await uploadToBucket(bucketKey, buffer);

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
          totalChunks: sql`(
            SELECT COUNT(*) FROM chunks
            WHERE recording_id = ${recordingId} AND is_acked = true
          )`,
          updatedAt: new Date(),
        })
        .where(eq(recordings.id, recordingId));
    }

    // Fire-and-forget transcription — does not block the upload response
    if (chunk) {
      void transcribeChunkAsync(chunk.chunkId, buffer);
    }

    return c.json({ ok: true, chunkId, bucketKey, chunk });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return c.json({ ok: false, error: message, chunkId }, 500);
  }
});

/**
 * Runs Whisper transcription after the chunk is safely stored.
 * Updates the chunk row and assembles the full recording transcript.
 */
async function transcribeChunkAsync(chunkId: string, wavBuffer: Buffer): Promise<void> {
  try {
    await db
      .update(chunks)
      .set({ transcriptStatus: "processing" })
      .where(eq(chunks.chunkId, chunkId));

    const result = await transcribeBuffer(wavBuffer, chunkId);

    if (result === null) {
      // No OPENAI_API_KEY — skip gracefully
      await db
        .update(chunks)
        .set({ transcriptStatus: "skipped" })
        .where(eq(chunks.chunkId, chunkId));
      return;
    }

    await db
      .update(chunks)
      .set({
        transcript: result.text,
        transcriptConfidence: result.confidence,
        transcriptStatus: "done",
      })
      .where(eq(chunks.chunkId, chunkId));

    // Assemble rolling recording-level transcript
    const [chunkRow] = await db
      .select({ recordingId: chunks.recordingId })
      .from(chunks)
      .where(eq(chunks.chunkId, chunkId));

    if (chunkRow?.recordingId) {
      await assembleRecordingTranscript(chunkRow.recordingId);
    }
  } catch (err) {
    console.error(`[transcribe] chunk ${chunkId} failed:`, err);
    await db
      .update(chunks)
      .set({ transcriptStatus: "failed" })
      .where(eq(chunks.chunkId, chunkId))
      .catch(() => {});
  }
}

/**
 * Concatenates all chunk transcripts (in sequence order) onto the recording row.
 */
async function assembleRecordingTranscript(recordingId: string): Promise<void> {
  const allChunks = await db
    .select({
      sequenceNumber: chunks.sequenceNumber,
      transcript: chunks.transcript,
      transcriptStatus: chunks.transcriptStatus,
    })
    .from(chunks)
    .where(eq(chunks.recordingId, recordingId))
    .orderBy(chunks.sequenceNumber);

  const fullText = allChunks
    .filter((c) => c.transcript)
    .map((c) => c.transcript)
    .join(" ")
    .trim();

  const allDone = allChunks.every(
    (c) =>
      c.transcriptStatus === "done" ||
      c.transcriptStatus === "skipped" ||
      c.transcriptStatus === "failed",
  );

  await db
    .update(recordings)
    .set({
      transcript: fullText || null,
      transcriptStatus: allDone ? "done" : "processing",
      updatedAt: new Date(),
    })
    .where(eq(recordings.id, recordingId));
}

// GET /api/chunks — list chunks with pagination
chunksRoute.get("/", async (c) => {
  const recordingId = c.req.query("recordingId");
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const offset = Number(c.req.query("offset") ?? 0);

  if (recordingId) {
    const result = await db
      .select()
      .from(chunks)
      .where(eq(chunks.recordingId, recordingId))
      .orderBy(chunks.sequenceNumber)
      .limit(limit)
      .offset(offset);
    return c.json(result);
  }

  const result = await db
    .select()
    .from(chunks)
    .orderBy(desc(chunks.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json(result);
});

// GET /api/chunks/stats — aggregate stats via SQL (no full-table scan)
chunksRoute.get("/stats", async (c) => {
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

  return c.json({
    total: Number(totals?.total ?? 0),
    acked: Number(totals?.acked ?? 0),
    pending: Number(totals?.pending ?? 0),
    totalBytes: Number(totals?.totalBytes ?? 0),
    totalDurationSeconds: Number(totals?.totalDurationSeconds ?? 0),
    transcribed: Number(totals?.transcribed ?? 0),
  });
});
