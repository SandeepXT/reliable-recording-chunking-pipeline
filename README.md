# Recording Pipeline — Production Ready

A full-stack audio recording pipeline: browser → WAV chunks → MinIO → PostgreSQL → Whisper transcript.

## What's included

| Feature | Status |
|---|---|
| 16 kHz PCM WAV chunking (AudioWorklet) | ✅ |
| OPFS durable local buffer | ✅ |
| MinIO S3 chunk storage | ✅ |
| PostgreSQL ack + reconcile | ✅ |
| Whisper (whisper-1) rolling transcript | ✅ |
| Bearer auth on all API routes | ✅ |
| Per-IP rate limiting on upload | ✅ |
| Body size guard (10 MB) | ✅ |
| Production startup guard (no secret = exit) | ✅ |
| Auth header forwarded from frontend | ✅ |

## Stack

- **Frontend**: Next.js 15, Tailwind CSS, shadcn/ui
- **Backend**: Hono on Bun
- **Storage**: MinIO (S3-compatible), PostgreSQL via Drizzle ORM
- **Transcript**: OpenAI Whisper API (`whisper-1`)
- **Monorepo**: npm workspaces + Turborepo

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥ 20 | npm workspaces + Next.js |
| Bun | ≥ 1.0 | API server runtime |
| Docker Desktop | any | Postgres + MinIO |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres + MinIO
npm run db:start

# 3. Push schema to DB
npm run db:push

# 4. Configure environment
cp apps/server/.env apps/server/.env.local
# Edit apps/server/.env — fill in API_SECRET and OPENAI_API_KEY

# 5. Start everything
npm run dev
# Web → http://localhost:3001
# API → http://localhost:3000
```

## Environment variables

### `apps/server/.env`

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CORS_ORIGIN` | ✅ | Frontend origin (e.g. `https://app.example.com`) |
| `API_SECRET` | ✅ prod | 32+ char random string. Generate: `openssl rand -hex 32` |
| `OPENAI_API_KEY` | optional | Enables Whisper transcription. Omit to skip. |
| `BUCKET_ENDPOINT` | ✅ | MinIO host |
| `BUCKET_PORT` | ✅ | MinIO port (default `9000`) |
| `BUCKET_USE_SSL` | ✅ | `true` in production |
| `BUCKET_ACCESS_KEY` | ✅ | MinIO access key |
| `BUCKET_SECRET_KEY` | ✅ | MinIO secret key |
| `BUCKET_NAME` | ✅ | Bucket name (default `recordings`) |

### `apps/web/.env.local`

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SERVER_URL` | ✅ | Full URL to the API server |
| `NEXT_PUBLIC_API_TOKEN` | prod | Same value as `API_SECRET` |

## Auth

All `/api/*` routes require `Authorization: Bearer <token>`.

- **Development**: leave `API_SECRET` empty → server bypasses auth with a warning.
- **Production**: server exits at startup if `API_SECRET` is not set.
- **Frontend**: set `NEXT_PUBLIC_API_TOKEN` to the same value; it's stored in `sessionStorage` and sent automatically.

## Rate limits

| Endpoint | Limit |
|---|---|
| `POST /api/chunks/upload` | 120 req/min per IP |
| All other `/api/*` | 600 req/min per IP |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.

## Transcript

Whisper transcription runs **asynchronously** after each chunk is stored in MinIO — it never blocks the upload response.

- Chunk transcript: `chunks.transcript`, `chunks.transcript_confidence`, `chunks.transcript_status`
- Recording transcript: `recordings.transcript` (assembled from all chunks in sequence)
- API: `GET /api/recordings/:id/transcript` — returns full text + per-segment breakdown
- Frontend: polls every 3 s and displays a rolling transcript panel in real time

If `OPENAI_API_KEY` is not set, transcript columns are left as `null` and `transcript_status = 'skipped'`.

## API reference

```
GET  /health                          — health check (no auth)
POST /api/recordings                  — create recording session
GET  /api/recordings                  — list recordings
GET  /api/recordings/:id              — get single recording
GET  /api/recordings/:id/transcript   — get rolling transcript
PATCH /api/recordings/:id/complete    — mark complete

POST /api/chunks/upload               — upload WAV chunk (rate limited)
GET  /api/chunks                      — list chunks (paginated)
GET  /api/chunks/stats                — aggregate stats

GET  /api/reconcile                   — find chunks missing from bucket
POST /api/reconcile/repair            — re-upload chunk from OPFS data
```

## Production deployment checklist

- [ ] `API_SECRET` set via CI/CD secrets (not in `.env` file)
- [ ] `OPENAI_API_KEY` set if transcription is needed
- [ ] `BUCKET_USE_SSL=true` and real MinIO/S3 credentials
- [ ] `CORS_ORIGIN` set to exact frontend domain (no trailing slash)
- [ ] `NODE_ENV=production`
- [ ] DB migrations run: `npm run db:migrate`
- [ ] For multi-instance deployments: swap in-process rate limiter for Redis-backed store
