import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import type { Transcript, TranscriptSegment, Word } from "@/lib/types";
import { probeMedia, runFfmpeg, runFfmpegCapture } from "@/lib/server/media";

/**
 * Server-side transcription. With OPENAI_API_KEY set, audio is extracted
 * to a compact mono mp3 and sent to Whisper with word-level timestamps.
 * Without a key, a clearly-labeled demo transcript is generated so the
 * whole editing pipeline stays usable offline.
 */

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

function segmentWords(words: Word[]): TranscriptSegment[] {
  // Sentence-ish segmentation: break on terminal punctuation or long gaps.
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
  for (const word of words) {
    if (
      bucket.length > 0 &&
      word.start - bucket[bucket.length - 1].end > 1.2
    ) {
      flush();
    }
    bucket.push(word);
    if (/[.!?]$/.test(word.text) || bucket.length >= 30) flush();
  }
  flush();
  return segments;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Transcribe via any OpenAI-compatible audio API (OpenAI or Groq). Returns
 * word-level timings when the provider gives them, otherwise synthesizes them
 * by distributing each segment's words evenly across the segment window (good
 * enough for karaoke captions).
 */
async function transcribeViaApi(
  mediaPath: string,
  opts: { apiKey?: string; baseURL?: string; model: string },
): Promise<Transcript> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });

  // 25 MB request cap — a 64kbps mono mp3 keeps ~50 min under the limit.
  const audioPath = path.join(os.tmpdir(), `clipforge-${crypto.randomUUID()}.mp3`);
  try {
    await runFfmpeg([
      "-i", mediaPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", audioPath,
    ]);

    const file = await OpenAI.toFile(await fs.readFile(audioPath), "audio.mp3");
    const result = (await client.audio.transcriptions.create({
      model: opts.model,
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    })) as unknown as {
      language?: string;
      words?: WhisperWord[];
      segments?: WhisperSegment[];
      text?: string;
    };

    const words: Word[] = (result.words ?? []).map((w, i) => ({
      id: `w-${i}`,
      text: w.word.trim(),
      start: w.start,
      end: w.end,
    }));

    // No word timings? Synthesize them from segment windows.
    if (words.length === 0 && result.segments?.length) {
      for (const seg of result.segments) {
        const toks = seg.text.trim().split(/\s+/).filter(Boolean);
        if (toks.length === 0) continue;
        const dur = Math.max(0.2, seg.end - seg.start);
        const per = dur / toks.length;
        toks.forEach((tok, j) => {
          const start = seg.start + j * per;
          words.push({ id: `w-${words.length}`, text: tok, start, end: start + per });
        });
      }
    }
    if (words.length === 0) throw new Error("transcription returned no words");

    return {
      words,
      segments: segmentWords(words),
      language: result.language ?? "en",
      source: "whisper",
    };
  } finally {
    await fs.unlink(audioPath).catch(() => undefined);
  }
}

/** Paid OpenAI Whisper (needs OPENAI_API_KEY). */
export async function transcribeWithWhisper(mediaPath: string): Promise<Transcript> {
  return transcribeViaApi(mediaPath, { model: "whisper-1" });
}

/** Free, fast cloud Whisper via Groq (needs a free GROQ_API_KEY, no card). */
export async function transcribeWithGroq(mediaPath: string): Promise<Transcript> {
  return transcribeViaApi(mediaPath, {
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
    model: process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo",
  });
}

// ---------------------------------------------------------------------------
// Free local transcription via the official OpenAI Whisper CLI (pip install
// -U openai-whisper). Most reliable free path — no node native deps.
// ---------------------------------------------------------------------------

/**
 * Real speech-to-text using the `whisper` command-line tool if it's on PATH.
 * Requires `pip install -U openai-whisper` and a system `ffmpeg`. The model
 * (tiny.en by default) downloads once on first run. Throws "whisper CLI not
 * installed" when unavailable so the caller can fall back.
 */
export async function transcribeWithWhisperCli(
  mediaPath: string,
): Promise<Transcript> {
  const model = process.env.WHISPER_MODEL || "tiny.en";
  const outDir = path.join(os.tmpdir(), `clip-whisper-${crypto.randomUUID()}`);
  await fs.mkdir(outDir, { recursive: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("whisper", [
        mediaPath,
        "--model", model,
        "--language", "en",
        "--word_timestamps", "True",
        "--output_format", "json",
        "--output_dir", outDir,
        "--fp16", "False",
        "--verbose", "False",
      ]);
      let errTail = "";
      proc.stderr.on("data", (d: Buffer) => (errTail = (errTail + d).slice(-2000)));
      proc.on("error", (e: NodeJS.ErrnoException) =>
        reject(e.code === "ENOENT" ? new Error("whisper CLI not installed") : e),
      );
      proc.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`whisper exited ${code}: ${errTail.slice(-300)}`)),
      );
    });

    const files = await fs.readdir(outDir);
    const jsonFile = files.find((f) => f.endsWith(".json"));
    if (!jsonFile) throw new Error("whisper produced no json output");
    const data = JSON.parse(
      await fs.readFile(path.join(outDir, jsonFile), "utf8"),
    ) as {
      language?: string;
      segments?: Array<{
        words?: Array<{ word: string; start: number; end: number }>;
      }>;
    };

    const words: Word[] = [];
    for (const seg of data.segments ?? []) {
      for (const w of seg.words ?? []) {
        const text = String(w.word ?? "").trim();
        if (!text) continue;
        words.push({
          id: `w-${words.length}`,
          text,
          start: w.start,
          end: Math.max(w.end, w.start + 0.05),
        });
      }
    }
    if (words.length === 0) throw new Error("whisper returned no words");
    return {
      words,
      segments: segmentWords(words),
      language: data.language ?? "en",
      source: "whisper",
    };
  } finally {
    await fs.rm(outDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Free local transcription (Whisper via transformers.js — no API, no credits)
// ---------------------------------------------------------------------------

// Cache the loaded ASR pipeline across requests (model load is expensive).
let localAsr: unknown | null = null;
let localAsrModel = "";

/**
 * Real speech-to-text that runs entirely on this machine using a small
 * Whisper model (default whisper-tiny.en) via @huggingface/transformers.
 * The model (~40MB) downloads once on first use and is cached on disk.
 * Requires the optional dependency to be installed; the caller falls back
 * to the demo transcript if it isn't or if anything goes wrong.
 */
export async function transcribeLocal(mediaPath: string): Promise<Transcript> {
  const modelId = process.env.WHISPER_MODEL || "Xenova/whisper-tiny.en";

  // Indirect specifier so TypeScript/webpack don't resolve this optional
  // dependency at build time; it's only required at runtime if present.
  const mod = "@huggingface/transformers";
  const tf = (await (import(/* webpackIgnore: true */ mod) as Promise<unknown>).catch(
    () => {
      throw new Error("local transcription engine not installed");
    },
  )) as {
    pipeline: (task: string, model: string) => Promise<unknown>;
    env: { cacheDir?: string; allowRemoteModels?: boolean };
  };

  tf.env.cacheDir =
    process.env.MODELS_DIR ||
    path.join(process.env.DATA_DIR || process.cwd(), ".data", "models");
  tf.env.allowRemoteModels = true;

  if (!localAsr || localAsrModel !== modelId) {
    localAsr = await tf.pipeline("automatic-speech-recognition", modelId);
    localAsrModel = modelId;
  }

  // Decode audio to 16 kHz mono float32 PCM (what the model expects).
  const pcm = await runFfmpegCapture([
    "-i", mediaPath,
    "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-",
  ]);
  const audio = new Float32Array(
    pcm.buffer,
    pcm.byteOffset,
    Math.floor(pcm.byteLength / 4),
  );

  const asr = localAsr as (
    input: Float32Array,
    opts: Record<string, unknown>,
  ) => Promise<{ text?: string; chunks?: Array<{ text: string; timestamp: [number, number | null] }> }>;

  const out = await asr(audio, {
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const chunks = out.chunks ?? [];
  const words: Word[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const text = c.text.trim();
    if (!text) continue;
    const start = c.timestamp[0] ?? (words.length ? words[words.length - 1].end : 0);
    const end =
      c.timestamp[1] ??
      (chunks[i + 1]?.timestamp[0] ?? start + 0.3);
    words.push({ id: `w-${words.length}`, text, start, end: Math.max(end, start + 0.05) });
  }
  if (words.length === 0) throw new Error("local transcription returned no words");

  return {
    words,
    segments: segmentWords(words),
    language: "en",
    source: "whisper",
  };
}

// ---------------------------------------------------------------------------
// Offline demo transcript
// ---------------------------------------------------------------------------

const DEMO_SENTENCES = [
  "Here's why most people never finish what they start.",
  "The biggest mistake I made cost me fifty thousand dollars in one year.",
  "Everyone thinks success comes from motivation, but that's completely wrong.",
  "Let me be real with you for a second about what actually works.",
  "Step one is embarrassingly simple, and nobody does it.",
  "I tracked every single hour for ninety days, and the results were shocking.",
  "Most people quit right before the compounding kicks in.",
  "The truth is, consistency beats intensity every single time.",
  "So here's the framework I wish someone had given me ten years ago.",
  "First thing every morning, you pick the one task that actually moves the needle.",
  "Stop doing the easy work first, it trains your brain to avoid the hard thing.",
  "And honestly, that one change doubled my output in three months.",
  "Number one reason businesses fail is not the product, it's distribution.",
  "You've been told to follow your passion, and it's terrible advice.",
  "Ask yourself this question before you start anything new.",
  "What would this look like if it were easy?",
];

export async function buildDemoTranscript(
  mediaPath: string,
): Promise<Transcript> {
  let duration = 120;
  try {
    duration = Math.max(20, (await probeMedia(mediaPath)).duration);
  } catch {
    // keep default
  }

  const words: Word[] = [];
  let t = 0.6;
  let wi = 0;
  let si = 0;
  while (t < duration - 2) {
    const sentence = DEMO_SENTENCES[si % DEMO_SENTENCES.length];
    si++;
    for (const token of sentence.split(" ")) {
      const len = 0.18 + Math.min(0.5, token.length * 0.045);
      if (t + len >= duration - 0.5) break;
      words.push({ id: `w-${wi++}`, text: token, start: t, end: t + len });
      t += len + 0.06;
    }
    t += 0.9; // breath between sentences
  }

  return {
    words,
    segments: segmentWords(words),
    language: "en",
    source: "mock",
  };
}
