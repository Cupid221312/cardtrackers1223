import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { Transcript, TranscriptSegment, Word } from "@/lib/types";
import { probeMedia, runFfmpeg } from "@/lib/server/media";

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

export async function transcribeWithWhisper(
  mediaPath: string,
): Promise<Transcript> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();

  // Whisper caps request size at 25 MB — a 64kbps mono mp3 keeps ~50 min
  // of speech under the limit and transcribes identically.
  const audioPath = path.join(
    os.tmpdir(),
    `clipforge-${crypto.randomUUID()}.mp3`,
  );
  try {
    await runFfmpeg([
      "-i", mediaPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "64k",
      audioPath,
    ]);

    const file = await OpenAI.toFile(
      await fs.readFile(audioPath),
      "audio.mp3",
    );
    const result = (await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    })) as unknown as { language?: string; words?: WhisperWord[]; text?: string };

    const words: Word[] = (result.words ?? []).map((w, i) => ({
      id: `w-${i}`,
      text: w.word.trim(),
      start: w.start,
      end: w.end,
    }));
    if (words.length === 0) {
      throw new Error("Whisper returned no word timestamps");
    }
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
