import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

function getClient(): S3Client {
  const endpoint = process.env.BUCKET_ENDPOINT;
  const region = process.env.BUCKET_REGION ?? "auto";

  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env.BUCKET_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.BUCKET_SECRET_KEY ?? "minioadmin",
    },
  });
}

function getBucketName(): string {
  return process.env.BUCKET_NAME ?? "recordings";
}

export async function ensureBucket(): Promise<void> {
  const client = getClient();
  const bucket = getBucketName();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function uploadToBucket(key: string, data: Buffer): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: data,
      ContentType: "audio/wav",
    })
  );
}

export async function chunkExistsInBucket(key: string): Promise<boolean> {
  const client = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: getBucketName(), Key: key }));
    return true;
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === "NotFound" || name === "NoSuchKey") return false;
    throw err;
  }
}

export async function getChunkFromBucket(key: string): Promise<Buffer> {
  const client = getClient();
  const res = await client.send(
    new GetObjectCommand({ Bucket: getBucketName(), Key: key })
  );
  const stream = res.Body;
  if (!stream) throw new Error("Empty body from bucket");
  // @ts-expect-error - Body is a ReadableStream in the browser / Node stream
  const chunks: Uint8Array[] = [];
  // @ts-expect-error
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function deleteFromBucket(key: string): Promise<void> {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
}
