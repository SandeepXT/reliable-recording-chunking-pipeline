"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Mic,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  CloudUpload,
  ShieldCheck,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { Button } from "@my-better-t-app/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@my-better-t-app/ui/components/card";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { useRecorder, type WavChunk } from "@/hooks/use-recorder";
import {
  createRecording,
  completeRecording,
  runReconcile,
  getTranscript,
  formatBytes,
  formatDuration,
  type TranscriptResponse,
} from "@/lib/api";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}

function UploadStatusIcon({ status }: { status: WavChunk["uploadStatus"] }) {
  if (status === "uploaded") return <CheckCircle2 className="size-3.5 text-emerald-500" />;
  if (status === "failed") return <XCircle className="size-3.5 text-destructive" />;
  if (status === "uploading") return <Loader2 className="size-3.5 animate-spin text-blue-500" />;
  return <div className="size-3.5 rounded-full border-2 border-muted-foreground/30" />;
}

function UploadStatusBadge({ status }: { status: WavChunk["uploadStatus"] }) {
  const map = {
    uploaded: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    failed: "bg-destructive/10 text-destructive",
    uploading: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    pending: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

function ChunkRow({ chunk, index }: { chunk: WavChunk; index: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); el.currentTime = 0; setPlaying(false); }
    else { void el.play(); setPlaying(true); }
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = chunk.url;
    a.download = `chunk-${String(index + 1).padStart(3, "0")}.wav`;
    a.click();
  };

  return (
    <div className="flex items-center gap-2 rounded border border-border/40 bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/40">
      <audio ref={audioRef} src={chunk.url} onEnded={() => setPlaying(false)} preload="none" />
      <UploadStatusIcon status={chunk.uploadStatus} />
      <span className="w-6 text-xs font-medium tabular-nums text-muted-foreground">#{index + 1}</span>
      <span className="text-xs tabular-nums">{chunk.duration.toFixed(1)}s</span>
      <span className="text-[10px] text-muted-foreground">{formatBytes(chunk.blob.size)}</span>
      <div className="ml-auto flex items-center gap-2">
        <UploadStatusBadge status={chunk.uploadStatus} />
        <Button variant="ghost" size="icon-xs" onClick={toggle} aria-label={playing ? "Stop" : "Play"}>
          {playing ? <Square className="size-3" /> : <Play className="size-3" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={download} aria-label="Download chunk">
          <Download className="size-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Transcript Panel ──────────────────────────────────────────────────────────

function TranscriptPanel({
  recordingId,
  isActive,
}: {
  recordingId: string | undefined;
  isActive: boolean;
}) {
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTranscript = useCallback(async () => {
    if (!recordingId) return;
    try {
      const data = await getTranscript(recordingId);
      setTranscript(data);
      // Stop polling once fully done
      if (data.transcriptStatus === "done" || data.transcriptStatus === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      // Server might not have transcription — silently ignore
    }
  }, [recordingId]);

  useEffect(() => {
    if (!recordingId) return;
    setLoading(true);
    void fetchTranscript().finally(() => setLoading(false));

    // Poll every 3s while recording is active or transcript is still processing
    pollRef.current = setInterval(() => { void fetchTranscript(); }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [recordingId, fetchTranscript]);

  if (!recordingId) return null;

  const status = transcript?.transcriptStatus;
  const hasText = !!transcript?.fullTranscript;
  const segments = transcript?.segments ?? [];
  const doneSegments = segments.filter((s) => s.transcript);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Transcript</CardTitle>
            {status === "processing" || (isActive && doneSegments.length > 0) ? (
              <span className="flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                <Loader2 className="size-2.5 animate-spin" /> live
              </span>
            ) : status === "done" ? (
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">done</span>
            ) : status === "skipped" ? (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">no API key</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {doneSegments.length}/{segments.length} chunks
            </span>
            <Button variant="ghost" size="icon-xs" onClick={() => setExpanded((e) => !e)}>
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
          </div>
        </div>
        <CardDescription>
          {status === "skipped" || (!hasText && status === "pending" && !isActive)
            ? "Set OPENAI_API_KEY on the server to enable Whisper transcription"
            : "Rolling transcript — updates as each chunk is processed"}
        </CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent>
          {loading && !transcript ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </div>
          ) : hasText ? (
            <div className="space-y-3">
              {/* Full assembled transcript */}
              <div className="rounded border border-border/40 bg-muted/20 p-3 text-sm leading-relaxed">
                {transcript?.fullTranscript}
              </div>
              {/* Per-segment breakdown (collapsible feel via details) */}
              <details className="group">
                <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
                  Show segments ({doneSegments.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {segments.map((seg) => (
                    <div
                      key={seg.sequenceNumber}
                      className="flex items-start gap-2 rounded border border-border/30 bg-muted/10 px-2.5 py-1.5 text-xs"
                    >
                      <span className="mt-0.5 shrink-0 tabular-nums text-muted-foreground">
                        #{seg.sequenceNumber + 1}
                      </span>
                      <span className="flex-1 leading-relaxed">
                        {seg.transcript ?? (
                          <span className="italic text-muted-foreground">
                            {seg.transcriptStatus === "processing" ? "transcribing…" : "pending"}
                          </span>
                        )}
                      </span>
                      {seg.transcriptConfidence !== null && (
                        <span className="shrink-0 text-muted-foreground">
                          {Math.round((seg.transcriptConfidence ?? 0) * 100)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isActive
                ? "Transcript will appear here as chunks finish processing…"
                : status === "skipped"
                ? "Transcription skipped — OPENAI_API_KEY not set."
                : "No transcript yet."}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Reconcile state ───────────────────────────────────────────────────────────

interface ReconcileState {
  running: boolean;
  result: { total: number; consistent: number; missing: number; repaired: number } | null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecorderPage() {
  const [sessionName, setSessionName] = useState("Recording Session");
  const [recordingId, setRecordingId] = useState<string | undefined>();
  const [reconcile, setReconcile] = useState<ReconcileState>({ running: false, result: null });
  const [retrying, setRetrying] = useState(false);

  const {
    status,
    start,
    stop,
    pause,
    resume,
    chunks,
    elapsed,
    stream,
    clearChunks,
    retryFailedChunks,
    reconcileFromOPFS,
    uploadedCount,
    failedCount,
    pendingCount,
  } = useRecorder({ chunkDuration: 5, recordingId });

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isActive = isRecording || isPaused;
  const isRequesting = status === "requesting";

  const handleStart = useCallback(async () => {
    try {
      const rec = await createRecording(sessionName || "Untitled Recording");
      setRecordingId(rec.id);
    } catch {
      // Server might be down — record locally anyway
    }
    await start();
  }, [sessionName, start]);

  const handleStop = useCallback(() => {
    stop();
    if (recordingId) {
      void completeRecording(recordingId).catch(() => {});
    }
  }, [stop, recordingId]);

  const handleReconcile = useCallback(async () => {
    setReconcile({ running: true, result: null });
    try {
      const result = await runReconcile();
      let repaired = 0;
      if (result.missingChunks.length > 0) {
        const missingIds = result.missingChunks.map((m) => m.chunkId);
        repaired = await reconcileFromOPFS(missingIds);
      }
      setReconcile({
        running: false,
        result: { total: result.total, consistent: result.consistent, missing: result.missing, repaired },
      });
    } catch {
      setReconcile({ running: false, result: null });
    }
  }, [reconcileFromOPFS]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    await retryFailedChunks();
    setRetrying(false);
  }, [retryFailedChunks]);

  const totalBytes = chunks.reduce((sum, c) => sum + c.blob.size, 0);
  const totalDuration = chunks.reduce((sum, c) => sum + c.duration, 0);

  return (
    <div className="container mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Recording Pipeline</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          16 kHz PCM WAV · OPFS-buffered · chunked every 5s · auto-uploaded · Whisper transcript
        </p>
      </div>

      {/* ── Session Name ── */}
      {!isActive && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="session-name" className="text-xs font-medium text-muted-foreground">
            Session name
          </label>
          <input
            id="session-name"
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            className="rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="My recording session"
          />
        </div>
      )}

      {/* ── Recorder Card ── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {isRecording ? "Recording…" : isPaused ? "Paused" : "Ready"}
            </CardTitle>
            {recordingId && (
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {recordingId.slice(0, 8)}
              </span>
            )}
          </div>
          <CardDescription>
            {isActive
              ? "Chunks are saved to OPFS then uploaded automatically"
              : "Press Record to begin — chunks upload in real time"}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {/* Waveform */}
          <div className="overflow-hidden rounded border border-border/50 bg-muted/20 text-foreground">
            <LiveWaveform
              active={isRecording}
              processing={isPaused}
              stream={stream}
              height={80}
              barWidth={3}
              barGap={1}
              barRadius={2}
              sensitivity={1.8}
              smoothingTimeConstant={0.85}
              fadeEdges
              fadeWidth={32}
              mode="static"
            />
          </div>

          {/* Timer */}
          <div className="text-center font-mono text-4xl tabular-nums tracking-tight">
            {formatTime(elapsed)}
          </div>

          {/* Stats row */}
          {(isActive || chunks.length > 0) && (
            <div className="grid grid-cols-4 divide-x divide-border rounded border border-border/40 bg-muted/10 text-center text-xs">
              <div className="py-2">
                <div className="font-medium tabular-nums">{chunks.length}</div>
                <div className="text-muted-foreground">chunks</div>
              </div>
              <div className="py-2">
                <div className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{uploadedCount}</div>
                <div className="text-muted-foreground">uploaded</div>
              </div>
              <div className="py-2">
                <div className={`font-medium tabular-nums ${failedCount > 0 ? "text-destructive" : ""}`}>{failedCount}</div>
                <div className="text-muted-foreground">failed</div>
              </div>
              <div className="py-2">
                <div className="font-medium tabular-nums">{formatBytes(totalBytes)}</div>
                <div className="text-muted-foreground">{formatDuration(Math.round(totalDuration))}</div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant={isActive ? "destructive" : "default"}
              className="gap-2 px-6"
              onClick={isActive ? handleStop : handleStart}
              disabled={isRequesting}
            >
              {isRequesting ? (
                <><Loader2 className="size-4 animate-spin" />Requesting…</>
              ) : isActive ? (
                <><Square className="size-4" />Stop</>
              ) : (
                <><Mic className="size-4" />Record</>
              )}
            </Button>

            {isActive && (
              <Button size="lg" variant="outline" className="gap-2" onClick={isPaused ? resume : pause}>
                {isPaused ? <><Play className="size-4" />Resume</> : <><Pause className="size-4" />Pause</>}
              </Button>
            )}
          </div>

          {/* Action row */}
          {chunks.length > 0 && !isActive && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
              {failedCount > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRetry} disabled={retrying}>
                  {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                  Retry {failedCount} failed
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReconcile} disabled={reconcile.running}>
                {reconcile.running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                Reconcile
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-destructive" onClick={clearChunks}>
                <Trash2 className="size-3.5" />Clear
              </Button>
            </div>
          )}

          {/* Reconcile result */}
          {reconcile.result && (
            <div className={`rounded border px-3 py-2.5 text-sm ${
              reconcile.result.missing === 0
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400"
            }`}>
              {reconcile.result.missing === 0 ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" />
                  All {reconcile.result.total} chunks consistent — bucket and DB in sync
                </span>
              ) : (
                <span>
                  Found {reconcile.result.missing} missing chunk{reconcile.result.missing !== 1 ? "s" : ""} —
                  repaired {reconcile.result.repaired} from OPFS
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Transcript Panel ── */}
      {recordingId && (
        <TranscriptPanel recordingId={recordingId} isActive={isActive} />
      )}

      {/* ── Chunk List ── */}
      {chunks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Chunks</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CloudUpload className="size-3.5" />
                {uploadedCount}/{chunks.length} uploaded
              </div>
            </div>
            <CardDescription>
              Each chunk is persisted to OPFS before upload — surviving page refreshes and network drops
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {chunks.map((chunk, i) => (
              <ChunkRow key={chunk.id} chunk={chunk} index={i} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Pipeline Info ── */}
      {!isActive && chunks.length === 0 && (
        <Card className="bg-muted/30">
          <CardContent className="pt-5">
            <h3 className="mb-3 text-sm font-medium">How the pipeline works</h3>
            <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
              {[
                "Audio is recorded and resampled to 16 kHz PCM WAV in the browser",
                "Each 5-second chunk is saved to OPFS (Origin Private File System) as a durable local buffer",
                "The chunk is uploaded to the server, which stores it in MinIO (S3-compatible bucket)",
                "The server writes an ack record to PostgreSQL — confirming bucket and DB are in sync",
                "Whisper transcribes each chunk asynchronously; the rolling transcript updates in real time",
                "Reconcile checks for DB-acked chunks missing from the bucket and repairs them from OPFS",
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  {text}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
