"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveChunkToOPFS, loadChunkFromOPFS, listOPFSChunks, deleteChunkFromOPFS } from "@/lib/opfs";
import { uploadChunk, blobToBase64, arrayBufferToBase64, repairChunk } from "@/lib/api";
import { registerWorklet } from "@/lib/recorder-worklet";

const SAMPLE_RATE = 16000;

export interface WavChunk {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  timestamp: number;
  sequenceNumber: number;
  uploadStatus: "pending" | "uploading" | "uploaded" | "failed";
  uploadAttempts: number;
  bucketKey?: string;
}

export type RecorderStatus = "idle" | "requesting" | "recording" | "paused";

interface UseRecorderOptions {
  chunkDuration?: number;
  deviceId?: string;
  recordingId?: string;
  onChunkUploaded?: (chunk: WavChunk) => void;
  onChunkFailed?: (chunk: WavChunk) => void;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function useRecorder(options: UseRecorderOptions = {}) {
  const { chunkDuration = 5, deviceId, recordingId, onChunkUploaded, onChunkFailed } = options;

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [chunks, setChunks] = useState<WavChunk[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // FIX: Use AudioWorkletNode instead of deprecated ScriptProcessorNode
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const cleanupWorkletUrlRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const pausedElapsedRef = useRef(0);
  const statusRef = useRef<RecorderStatus>("idle");
  const sequenceRef = useRef(0);
  statusRef.current = status;

  const uploadChunkToServer = useCallback(
    async (chunk: WavChunk): Promise<void> => {
      const chunkId = chunk.id;
      setChunks((prev) =>
        prev.map((c) => (c.id === chunkId ? { ...c, uploadStatus: "uploading" as const } : c)),
      );
      try {
        // 1. Persist to OPFS first — durable client-side buffer
        const wavBuffer = await chunk.blob.arrayBuffer();
        await saveChunkToOPFS(chunkId, wavBuffer);

        // 2. Upload to server (bucket + DB ack)
        const base64 = await blobToBase64(chunk.blob);
        const result = await uploadChunk({
          chunkId,
          recordingId,
          sequenceNumber: chunk.sequenceNumber,
          durationSeconds: chunk.duration,
          data: base64,
        });

        // 3. Mark uploaded
        setChunks((prev) =>
          prev.map((c) =>
            c.id === chunkId
              ? { ...c, uploadStatus: "uploaded" as const, bucketKey: result.bucketKey, uploadAttempts: c.uploadAttempts + 1 }
              : c,
          ),
        );

        // FIX: Delete from OPFS only after bucket + DB are both confirmed
        // This keeps OPFS as a safety net for reconciliation
        // We keep OPFS for reconciliation safety during the session.
        // For long-running production use, call deleteChunkFromOPFS here.
        // await deleteChunkFromOPFS(chunkId);

        onChunkUploaded?.({ ...chunk, uploadStatus: "uploaded", bucketKey: result.bucketKey });
      } catch {
        setChunks((prev) =>
          prev.map((c) =>
            c.id === chunkId
              ? { ...c, uploadStatus: "failed" as const, uploadAttempts: c.uploadAttempts + 1 }
              : c,
          ),
        );
        onChunkFailed?.({ ...chunk, uploadStatus: "failed" });
      }
    },
    [recordingId, onChunkUploaded, onChunkFailed],
  );

  const retryFailedChunks = useCallback(async (): Promise<number> => {
    const failedChunks = chunks.filter((c) => c.uploadStatus === "failed");
    let repaired = 0;
    for (const chunk of failedChunks) {
      const opfsData = await loadChunkFromOPFS(chunk.id);
      if (opfsData) {
        const base64 = arrayBufferToBase64(opfsData);
        try {
          await uploadChunk({
            chunkId: chunk.id,
            recordingId,
            sequenceNumber: chunk.sequenceNumber,
            durationSeconds: chunk.duration,
            data: base64,
          });
          setChunks((prev) =>
            prev.map((c) => (c.id === chunk.id ? { ...c, uploadStatus: "uploaded" as const } : c)),
          );
          repaired++;
        } catch {
          // Still failing — remains in OPFS
        }
      }
    }
    return repaired;
  }, [chunks, recordingId]);

  const reconcileFromOPFS = useCallback(
    async (missingChunkIds: string[]): Promise<number> => {
      let repaired = 0;
      for (const chunkId of missingChunkIds) {
        const opfsData = await loadChunkFromOPFS(chunkId);
        if (opfsData) {
          const base64 = arrayBufferToBase64(opfsData);
          try {
            await repairChunk(chunkId, base64);
            repaired++;
          } catch {
            // No-op — stays in OPFS for next reconcile attempt
          }
        }
      }
      return repaired;
    },
    [],
  );

  const makeChunkAndUpload = useCallback(
    (samples: Float32Array) => {
      const blob = encodeWav(samples, SAMPLE_RATE);
      const url = URL.createObjectURL(blob);
      const seq = sequenceRef.current++;
      const chunk: WavChunk = {
        id: crypto.randomUUID(),
        blob,
        url,
        duration: samples.length / SAMPLE_RATE,
        timestamp: Date.now(),
        sequenceNumber: seq,
        uploadStatus: "pending",
        uploadAttempts: 0,
      };
      setChunks((prev) => [...prev, chunk]);
      void uploadChunkToServer(chunk);
    },
    [uploadChunkToServer],
  );

  const start = useCallback(async () => {
    if (statusRef.current === "recording") return;
    setStatus("requesting");
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      });

      // FIX: Use AudioWorkletNode (replaces deprecated ScriptProcessorNode)
      const audioCtx = new AudioContext();
      const nativeSampleRate = audioCtx.sampleRate;

      // Register the worklet processor
      const cleanupUrl = await registerWorklet(audioCtx);
      cleanupWorkletUrlRef.current = cleanupUrl;

      const workletNode = new AudioWorkletNode(audioCtx, "chunk-processor");
      const chunkThreshold = Math.round(SAMPLE_RATE * chunkDuration);

      // Configure the worklet
      workletNode.port.postMessage({
        type: "config",
        threshold: chunkThreshold,
        targetRate: SAMPLE_RATE,
        nativeRate: nativeSampleRate,
      });

      // Receive completed chunks from the worklet thread
      workletNode.port.onmessage = (e: MessageEvent<{ type: string; samples: Float32Array }>) => {
        if (e.data.type === "chunk" && statusRef.current === "recording") {
          makeChunkAndUpload(e.data.samples);
        }
      };

      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(workletNode);
      // Connect to destination so the AudioContext stays active (silent — no output)
      workletNode.connect(audioCtx.destination);

      streamRef.current = mediaStream;
      audioCtxRef.current = audioCtx;
      workletNodeRef.current = workletNode;
      setStream(mediaStream);
      pausedElapsedRef.current = 0;
      startTimeRef.current = Date.now();
      setElapsed(0);
      setStatus("recording");

      timerRef.current = setInterval(() => {
        if (statusRef.current === "recording") {
          setElapsed(pausedElapsedRef.current + (Date.now() - startTimeRef.current) / 1000);
        }
      }, 100);
    } catch {
      setStatus("idle");
    }
  }, [deviceId, chunkDuration, makeChunkAndUpload]);

  const stopAudio = useCallback(() => {
    // Flush any remaining buffered samples before stopping
    workletNodeRef.current?.port.postMessage({ type: "flush" });
    workletNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close();
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupWorkletUrlRef.current?.();
    workletNodeRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
    cleanupWorkletUrlRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopAudio();
    setStream(null);
    setStatus("idle");
  }, [stopAudio]);

  const pause = useCallback(() => {
    if (statusRef.current !== "recording") return;
    pausedElapsedRef.current += (Date.now() - startTimeRef.current) / 1000;
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    startTimeRef.current = Date.now();
    setStatus("recording");
  }, []);

  const clearChunks = useCallback(() => {
    for (const c of chunks) URL.revokeObjectURL(c.url);
    setChunks([]);
    sequenceRef.current = 0;
  }, [chunks]);

  const recoverFromOPFS = useCallback(async (): Promise<string[]> => {
    return listOPFSChunks();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  const uploadedCount = chunks.filter((c) => c.uploadStatus === "uploaded").length;
  const failedCount = chunks.filter((c) => c.uploadStatus === "failed").length;
  const pendingCount = chunks.filter(
    (c) => c.uploadStatus === "pending" || c.uploadStatus === "uploading",
  ).length;

  return {
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
    recoverFromOPFS,
    uploadedCount,
    failedCount,
    pendingCount,
  };
}
