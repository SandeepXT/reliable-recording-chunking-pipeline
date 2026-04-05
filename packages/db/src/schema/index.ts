import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    status: text("status", { enum: ["recording", "completed", "failed"] })
      .notNull()
      .default("recording"),
    totalChunks: integer("total_chunks").notNull().default(0),
    // Transcript: assembled from all chunk transcripts when recording completes
    transcript: text("transcript"),
    transcriptStatus: text("transcript_status", {
      enum: ["pending", "processing", "done", "failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("recordings_status_idx").on(table.status),
    index("recordings_created_at_idx").on(table.createdAt),
    index("recordings_transcript_status_idx").on(table.transcriptStatus),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chunkId: text("chunk_id").notNull().unique(),
    recordingId: uuid("recording_id").references(() => recordings.id, {
      onDelete: "cascade",
    }),
    sequenceNumber: integer("sequence_number").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    bucketKey: text("bucket_key").notNull(),
    ackedAt: timestamp("acked_at"),
    isAcked: boolean("is_acked").notNull().default(false),
    uploadAttempts: integer("upload_attempts").notNull().default(0),
    // Transcript fields per chunk
    transcript: text("transcript"),
    transcriptConfidence: real("transcript_confidence"),
    transcriptStatus: text("transcript_status", {
      enum: ["pending", "processing", "done", "failed", "skipped"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("chunks_recording_id_idx").on(table.recordingId),
    index("chunks_is_acked_idx").on(table.isAcked),
    index("chunks_recording_seq_idx").on(table.recordingId, table.sequenceNumber),
    index("chunks_created_at_idx").on(table.createdAt),
    index("chunks_transcript_status_idx").on(table.transcriptStatus),
  ],
);

export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
