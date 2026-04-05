/**
 * AudioWorklet processor source — inlined as a string so it can be registered
 * via a Blob URL without a separate file server. This replaces the deprecated
 * ScriptProcessorNode with a proper AudioWorkletNode running off the main thread.
 */
export const WORKLET_SOURCE = /* js */ `
class ChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffers = [];
    this._sampleCount = 0;
    this._threshold = 0;
    this._targetRate = 16000;
    this._nativeRate = sampleRate; // AudioWorkletGlobalScope provides sampleRate
    this.port.onmessage = (e) => {
      if (e.data.type === "config") {
        this._threshold = e.data.threshold;
        this._targetRate = e.data.targetRate;
        this._nativeRate = e.data.nativeRate || sampleRate;
      }
      if (e.data.type === "flush") {
        this._flush();
      }
    };
  }

  _resample(input) {
    if (this._nativeRate === this._targetRate) return input;
    const ratio = this._nativeRate / this._targetRate;
    const length = Math.round(input.length / ratio);
    const output = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const srcIndex = i * ratio;
      const low = Math.floor(srcIndex);
      const high = Math.min(low + 1, input.length - 1);
      const frac = srcIndex - low;
      output[i] = (input[low] ?? 0) * (1 - frac) + (input[high] ?? 0) * frac;
    }
    return output;
  }

  _flush() {
    if (this._buffers.length === 0) return;
    const totalLen = this._buffers.reduce((n, b) => n + b.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const buf of this._buffers) {
      merged.set(buf, offset);
      offset += buf.length;
    }
    this._buffers = [];
    this._sampleCount = 0;
    this.port.postMessage({ type: "chunk", samples: merged }, [merged.buffer]);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;
    const resampled = this._resample(new Float32Array(input));
    this._buffers.push(resampled);
    this._sampleCount += resampled.length;
    if (this._sampleCount >= this._threshold) {
      this._flush();
    }
    return true;
  }
}

registerProcessor("chunk-processor", ChunkProcessor);
`;

/**
 * Creates a Blob URL for the worklet source and registers it with the AudioContext.
 * Returns a cleanup function that revokes the Blob URL.
 */
export async function registerWorklet(ctx: AudioContext): Promise<() => void> {
  const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await ctx.audioWorklet.addModule(url);
  return () => URL.revokeObjectURL(url);
}
