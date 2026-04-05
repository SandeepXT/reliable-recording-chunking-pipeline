import * as Minio from "minio";
import { env } from "@my-better-t-app/env/server";

let client: Minio.Client | null = null;

function getClient(): Minio.Client {
  if (!client) {
    client = new Minio.Client({
      endPoint: env.BUCKET_ENDPOINT,
      port: env.BUCKET_PORT,
      useSSL: env.BUCKET_USE_SSL,
      accessKey: env.BUCKET_ACCESS_KEY,
      secretKey: env.BUCKET_SECRET_KEY,
    });
  }
  return client;
}

export async function ensureBucket(): Promise<void> {
  const mc = getClient();
  const exists = await mc.bucketExists(env.BUCKET_NAME);
  if (!exists) {
    await mc.makeBucket(env.BUCKET_NAME);
  }
}

export async function uploadToBucket(key: string, data: Buffer): Promise<void> {
  const mc = getClient();
  await mc.putObject(env.BUCKET_NAME, key, data, data.length, {
    "Content-Type": "audio/wav",
  });
}

/**
 * FIX: Distinguish between "not found" and real errors.
 * A MinIO outage must not silently return false — that would cause
 * reconciliation to mark all chunks as missing and re-upload everything.
 */
export async function chunkExistsInBucket(key: string): Promise<boolean> {
  try {
    const mc = getClient();
    await mc.statObject(env.BUCKET_NAME, key);
    return true;
  } catch (err: unknown) {
    // MinIO SDK throws an error with code "NotFound" when the object doesn't exist.
    // Any other error (network, auth, etc.) should be re-thrown so the caller
    // knows reconciliation cannot be trusted.
    const code = (err as { code?: string })?.code;
    if (code === "NotFound" || code === "NoSuchKey") {
      return false;
    }
    throw err;
  }
}

export async function getChunkFromBucket(key: string): Promise<Buffer> {
  const mc = getClient();
  const stream = await mc.getObject(env.BUCKET_NAME, key);
  return new Promise<Buffer>((resolve, reject) => {
    const bufs: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => bufs.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(bufs)));
    stream.on("error", reject);
  });
}

export async function deleteFromBucket(key: string): Promise<void> {
  const mc = getClient();
  await mc.removeObject(env.BUCKET_NAME, key);
}
