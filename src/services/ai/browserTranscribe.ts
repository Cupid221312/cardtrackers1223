import type { Transcript, TranscriptSegment, Word } from "@/lib/types";

/**
 * In-browser speech-to-text — the free path that needs NO account, NO API key,
 * and NO local install. It loads a small Whisper model (transformers.js) from
 * a CDN and runs it on the user's machine via WebAssembly/WebGPU. The model
 * (~40MB) downloads once and is cached by the browser.
 *
 * The server only extracts clean 16 kHz audio (/api/media/[id]/audio); all the
 * ML runs client-side, so it works even on a host with no transcription set up.
 */

// transformers.js is loaded from a CDN at runtime (see loadTransformers).
/* eslint-disable @typescript-eslint/no-explicit-any */
type AsrPipeline = (input: Float32Array, opts: Record<string, any>) => Promise<{
  text?: string;
  chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
}>;

let cachedPipeline: AsrPipeline | null = null;

const CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";

async function loadPipeline(
  model: string,
  onProgress: (msg: string) => void,
): Promise<AsrPipeline> {
  if (cachedPipeline) return cachedPipeline;
  onProgress("Loading speech model (first time downloads ~40MB)…");
  const tf: any = await import(/* webpackIgnore: true */ CDN as string);
  tf.env.allowLocalModels = false;
  const pipe = await tf.pipeline("automatic-speech-recognition", model, {
    progress_callback: (p: any) => {
      if (p?.status === "progress" && p?.file && typeof p.progress === "number") {
        onProgress(`Downloading model: ${Math.round(p.progress)}%`);
      }
    },
  });
  cachedPipeline = pipe as AsrPipeline;
  return cachedPipeline;
}

/** Fetch the 16 kHz WAV and decode it to a mono Float32Array at 16 kHz. */
async function decodeAudio(mediaId: string): Promise<Float32Array> {
  const res = await fetch(`/api/media/${mediaId}/audio`);
  if (!res.ok) throw new Error("could not fetch audio for transcription");
  const arr = await res.arrayBuffer();
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const tmp = new AC();
  const decoded = await tmp.decodeAudioData(arr.slice(0));
  await tmp.close();
  // Resample to exactly 16 kHz mono (what Whisper expects).
  const Offline: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const frames = Math.ceil(decoded.duration * 16000);
  const off = new Offline(1, Math.max(1, frames), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

function segmentWords(words: Word[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let bucket: Word[] = [];
  const flush = () => {
    if (bucket.length === 0) return;
    segments.push({
      id: `seg-${segments.length}`,
      text: bucket.map((w) => w.text).join(" "),
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      wordIds: bucket.map((w) => w.id),
    });
    bucket = [];
  };
  for (const w of words) {
    if (bucket.length > 0 && w.start - bucket[bucket.length - 1].end > 1.2) flush();
    bucket.push(w);
    if (/[.!?]$/.test(w.text) || bucket.length >= 30) flush();
  }
  flush();
  return segments;
}

export async function transcribeInBrowser(
  mediaId: string,
  onProgress: (msg: string) => void = () => {},
  model = "Xenova/whisper-tiny.en",
): Promise<Transcript> {
  const pipe = await loadPipeline(model, onProgress);
  onProgress("Decoding audio…");
  const audio = await decodeAudio(mediaId);
  onProgress("Transcribing… (this can take a minute on a long video)");
  const out = await pipe(audio, {
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const chunks = out.chunks ?? [];
  const words: Word[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i].text.trim();
    if (!text) continue;
    const start =
      chunks[i].timestamp[0] ?? (words.length ? words[words.length - 1].end : 0);
    const end = chunks[i].timestamp[1] ?? (chunks[i + 1]?.timestamp[0] ?? start + 0.3);
    words.push({
      id: `w-${words.length}`,
      text,
      start,
      end: Math.max(end, start + 0.05),
    });
  }
  if (words.length === 0) throw new Error("no speech detected");
  return { words, segments: segmentWords(words), language: "en", source: "whisper" };
}
