import { Hono } from "hono";
import { db } from "@my-better-t-app/db";
import { recordings, chunks } from "@my-better-t-app/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export const recordingsRoute = new Hono();

const createRecordingSchema = z.object({
  name: z.string().min(1).max(200),
});

// POST /api/recordings — create a new recording session
recordingsRoute.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createRecordingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const [recording] = await db
    .insert(recordings)
    .values({ name: parsed.data.name })
    .returning();

  return c.json({ ok: true, recording }, 201);
});

// GET /api/recordings — list all recordings
recordingsRoute.get("/", async (c) => {
  const allRecordings = await db
    .select()
    .from(recordings)
    .orderBy(desc(recordings.createdAt));
  return c.json(allRecordings);
});

// GET /api/recordings/:id — get a single recording with transcript
recordingsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [recording] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.id, id));

  if (!recording) return c.json({ error: "Not found" }, 404);
  return c.json(recording);
});

// GET /api/recordings/:id/transcript — get the full rolling transcript
// Returns chunk-level segments so the frontend can render word-by-word
recordingsRoute.get("/:id/transcript", async (c) => {
  const id = c.req.param("id");

  const [recording] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.id, id));

  if (!recording) return c.json({ error: "Not found" }, 404);

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

  return c.json({
    recordingId: id,
    recordingName: recording.name,
    transcriptStatus: recording.transcriptStatus,
    fullTranscript: recording.transcript,
    segments: chunkSegments,
  });
});

// PATCH /api/recordings/:id/complete — mark recording completed
recordingsRoute.patch("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const [updated] = await db
    .update(recordings)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(recordings.id, id))
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, recording: updated });
});
