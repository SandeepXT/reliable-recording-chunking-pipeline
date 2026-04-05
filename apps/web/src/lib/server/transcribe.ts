export interface TranscriptResult {
  text: string;
  confidence: number;
}

export async function transcribeBuffer(
  wavBuffer: Buffer,
  chunkId: string
): Promise<TranscriptResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const boundary = `----FormBoundary${chunkId.replace(/-/g, "").slice(0, 16)}`;
  const filename = `${chunkId}.wav`;

  const preamble = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="model"`,
    "",
    "whisper-1",
    `--${boundary}`,
    `Content-Disposition: form-data; name="response_format"`,
    "",
    "verbose_json",
    `--${boundary}`,
    `Content-Disposition: form-data; name="language"`,
    "",
    "en",
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    "Content-Type: audio/wav",
    "",
    "",
  ].join("\r\n");

  const epilogue = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(preamble, "utf8"),
    wavBuffer,
    Buffer.from(epilogue, "utf8"),
  ]);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errText}`);
  }

  const json = (await response.json()) as {
    text: string;
    segments?: { avg_logprob: number }[];
  };

  const segments = json.segments ?? [];
  const avgLogProb =
    segments.length > 0
      ? segments.reduce((s, seg) => s + seg.avg_logprob, 0) / segments.length
      : -0.5;
  const confidence = Math.max(0, Math.min(1, 1 + avgLogProb / 2));

  return { text: json.text.trim(), confidence };
}
