"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, Database, HardDrive, Cloud, ShieldCheck, ArrowRight, CheckCircle2, XCircle, Loader2, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@my-better-t-app/ui/components/card";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { checkHealth, getChunkStats, type ChunkStats, formatBytes, formatDuration } from "@/lib/api";
import { cn } from "@my-better-t-app/ui/lib/utils";

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  return ok
    ? <CheckCircle2 className="size-3.5 text-emerald-500" />
    : <XCircle className="size-3.5 text-destructive" />;
}

const PIPELINE_STEPS = [
  {
    icon: Mic,
    title: "Record & Chunk",
    description: "Browser captures audio at 16 kHz PCM and splits it into 5-second WAV chunks via AudioWorklet",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    icon: HardDrive,
    title: "OPFS Buffer",
    description: "Each chunk is persisted to the Origin Private File System before any network call — surviving tab closes and network drops",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: Cloud,
    title: "Bucket Upload",
    description: "Chunks are uploaded to S3-compatible storage (Cloudflare R2 / AWS S3) via Next.js API routes",
    color: "text-sky-500",
    bg: "bg-sky-500/10",
  },
  {
    icon: Database,
    title: "DB Acknowledgment",
    description: "Once the bucket confirms receipt, an ack record is written to PostgreSQL via Drizzle ORM",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    icon: FileText,
    title: "Whisper Transcript",
    description: "Each chunk is transcribed asynchronously via OpenAI Whisper — a rolling transcript updates in real time",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    icon: ShieldCheck,
    title: "Reconciliation",
    description: "If the DB shows an ack but the bucket is missing a chunk, the client re-uploads from OPFS to restore consistency",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
];

export default function Home() {
  const [health, setHealth] = useState<boolean | null>(null);
  const [stats, setStats] = useState<ChunkStats | null>(null);

  useEffect(() => {
    checkHealth()
      .then(() => setHealth(true))
      .catch(() => setHealth(false));

    getChunkStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      {/* Hero */}
      <div className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Production-ready Recording Pipeline
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Zero-loss audio recording
        </h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          A production-grade pipeline that ensures recording data stays accurate in all cases — no data loss, no silent failures.
          Built with Next.js, Drizzle + PostgreSQL, S3-compatible storage, and Whisper.
        </p>
        <div className="mt-5 flex gap-3">
          <Link
            href="/recorder"
            className={cn(buttonVariants({ size: "lg" }), "gap-2")}
          >
            <Mic className="size-4" />
            Open Recorder
          </Link>
          <Link
            href="/api/health"
            target="_blank"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
          >
            API Health
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Status cards */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">API Server</p>
              <StatusDot ok={health} />
            </div>
            <p className="mt-1 text-sm font-medium">{health === null ? "Checking…" : health ? "Online" : "Offline"}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total chunks</p>
            <p className="mt-1 text-sm font-medium">{stats ? stats.total.toLocaleString() : "—"}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total audio</p>
            <p className="mt-1 text-sm font-medium">{stats ? formatDuration(stats.totalDurationSeconds) : "—"}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Storage used</p>
            <p className="mt-1 text-sm font-medium">{stats ? formatBytes(stats.totalBytes) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline steps */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">How it works</h2>
        <div className="flex flex-col gap-3">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-4 rounded-lg border border-border/40 bg-muted/20 p-4">
              <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", step.bg)}>
                <step.icon className={cn("size-4", step.color)} />
              </div>
              <div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
