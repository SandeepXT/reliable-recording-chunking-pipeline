# Recording Pipeline

A production-grade audio recording pipeline with zero data loss. Records in 5-second WAV chunks, buffers to OPFS, uploads to S3-compatible storage, acknowledges to PostgreSQL, and transcribes via Whisper.

## Architecture

The entire stack runs as a single **Next.js app on Vercel**:
- `/app/api/*` — Route Handlers (formerly the separate Hono server)
- `/app/recorder` — Recording UI
- Storage: any S3-compatible bucket (Cloudflare R2, AWS S3)
- Database: any hosted PostgreSQL (Neon, Supabase, Railway)

## Local Development

```bash
npm install

# Start local Postgres + MinIO (optional)
npm run db:start

# Push schema
npm run db:push

# Start dev server at http://localhost:3001
npm run dev:web
```

## Deploying to Vercel

### 1. Set up external services

**Database** — use one of:
- [Neon](https://neon.tech) (free tier, serverless Postgres)
- [Supabase](https://supabase.com)
- [Railway](https://railway.app)

**Object Storage** — use one of:
- [Cloudflare R2](https://developers.cloudflare.com/r2/) (no egress fees, recommended)
- [AWS S3](https://aws.amazon.com/s3/)

### 2. Run database migrations

```bash
DATABASE_URL=your-production-url npm run db:push
```

### 3. Deploy to Vercel

```bash
npx vercel --prod
```

Or connect your GitHub repo in the Vercel dashboard. The `vercel.json` at the root handles the build config automatically.

### 4. Set environment variables in Vercel

Go to **Project → Settings → Environment Variables** and add:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `API_SECRET` | Random 32+ char secret (`openssl rand -hex 32`) |
| `BUCKET_ENDPOINT` | R2: `https://<id>.r2.cloudflarestorage.com` · S3: leave blank |
| `BUCKET_REGION` | R2: `auto` · S3: e.g. `us-east-1` |
| `BUCKET_ACCESS_KEY` | Bucket access key |
| `BUCKET_SECRET_KEY` | Bucket secret key |
| `BUCKET_NAME` | Bucket name (e.g. `recordings`) |
| `OPENAI_API_KEY` | Optional — enables Whisper transcription |
| `NEXT_PUBLIC_API_TOKEN` | Same value as `API_SECRET` — sent by the browser |

### 5. Redeploy

After setting env vars, trigger a new deployment. The app will be live at your Vercel URL.

## Environment Variables Reference

See `apps/web/.env.local.example` for local development setup.
