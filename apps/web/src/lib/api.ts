"use client";

import { env } from "@my-better-t-app/env/web";

const BASE = env.NEXT_PUBLIC_SERVER_URL;

/**
 * Get the Bearer token from env or sessionStorage (set at login / app init).
 * In development with no API_SECRET, the server passes through without a token.
 */
function getAuthHeader(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? (sessionStorage.getItem("api_token") ?? process.env.NEXT_PUBLIC_API_TOKEN ?? "")
      : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Recording {
  id: string;
  name: string;
  status: "recording" | "completed" | "failed";
  totalChunks: number;
  transcript: string | null;
  transcriptStatus: "pending" | "processing" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface ChunkRecord {
  id: string;
  chunkId: string;
  recordingId: string | null;
  sequenceNumber: number;
  sizeBytes: number;
  durationSeconds: number;
  bucketKey: string;
  isAcked: boolean;
  ackedAt: string | null;
  uploadAttempts: number;
  transcript: string | null;
  transcriptConfidence: number | null;
  transcriptStatus: "pending" | "processing" | "done" | "failed" | "skipped";
  createdAt: string;
}

export interface ChunkStats {
  total: number;
  acked: number;
  pending: number;
  totalBytes: number;
  totalDurationSeconds: number;
  transcribed: number;
}

export interface ReconcileResult {
  total: number;
  consistent: number;
  missing: number;
  missingChunks: {
    chunkId: string;
    bucketKey: string;
    recordingId: string | null;
    sequenceNumber: number;
  }[];
}

export interface TranscriptResponse {
  recordingId: string;
  recordingName: string;
  transcriptStatus: string;
  fullTranscript: string | null;
  segments: {
    sequenceNumber: number;
    durationSeconds: number;
    transcript: string | null;
    transcriptConfidence: number | null;
    transcriptStatus: string;
  }[];
}

// ─── Recordings ───────────────────────────────────────────────────────────────

export async function createRecording(name: string): Promise<Recording> {
  const res = await apiFetch<{ ok: boolean; recording: Recording }>("/api/recordings", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return res.recording;
}

export async function listRecordings(): Promise<Recording[]> {
  return apiFetch<Recording[]>("/api/recordings");
}

export async function getRecording(id: string): Promise<Recording> {
  return apiFetch<Recording>(`/api/recordings/${id}`);
}

export async function completeRecording(id: string): Promise<Recording> {
  const res = await apiFetch<{ ok: boolean; recording: Recording }>(
    `/api/recordings/${id}/complete`,
    { method: "PATCH" },
  );
  return res.recording;
}

export async function getTranscript(recordingId: string): Promise<TranscriptResponse> {
  return apiFetch<TranscriptResponse>(`/api/recordings/${recordingId}/transcript`);
}

// ─── Chunks ───────────────────────────────────────────────────────────────────

export async function uploadChunk(params: {
  chunkId: string;
  recordingId?: string;
  sequenceNumber: number;
  durationSeconds: number;
  data: string; // base64
}): Promise<{ ok: boolean; chunkId: string; bucketKey: string }> {
  return apiFetch("/api/chunks/upload", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getChunkStats(): Promise<ChunkStats> {
  return apiFetch<ChunkStats>("/api/chunks/stats");
}

export async function listChunks(recordingId?: string): Promise<ChunkRecord[]> {
  const qs = recordingId ? `?recordingId=${recordingId}` : "";
  return apiFetch<ChunkRecord[]>(`/api/chunks${qs}`);
}

// ─── Reconcile ────────────────────────────────────────────────────────────────

export async function runReconcile(): Promise<ReconcileResult> {
  return apiFetch<ReconcileResult>("/api/reconcile");
}

export async function repairChunk(chunkId: string, data: string): Promise<{ ok: boolean }> {
  return apiFetch("/api/reconcile/repair", {
    method: "POST",
    body: JSON.stringify({ chunkId, data }),
  });
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ ok: boolean; ts: number }> {
  return apiFetch<{ ok: boolean; ts: number }>("/health");
}

// ─── Utils ────────────────────────────────────────────────────────────────────

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
