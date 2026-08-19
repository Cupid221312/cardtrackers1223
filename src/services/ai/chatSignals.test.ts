import { describe, expect, it } from "vitest";
import {
  chatWindowMetrics,
  reactionTokens,
  scoreChatWindows,
  type ChatMessage,
} from "@/services/ai/chatSignals";
import { findClipsFromSignals } from "@/services/ai/signalClipFinder";

/** Steady background chatter across the whole stream. */
function baseline(duration: number, perSecond = 1): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let t = 0; t < duration; t += 1 / perSecond) {
    out.push({
      offset: t,
      user: `viewer${Math.floor(t) % 40}`,
      text: "yeah true",
    });
  }
  return out;
}

/** A burst of distinct people spamming hype emotes. */
function hypeBurst(at: number, seconds = 8, people = 30): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < people * seconds; i++) {
    out.push({
      offset: at + (i / (people * seconds)) * seconds,
      user: `hype${i % people}`,
      text: i % 2 === 0 ? "KEKW" : "OMEGALUL",
    });
  }
  return out;
}

describe("reactionTokens", () => {
  it("counts hype emotes and written laughter", () => {
    expect(reactionTokens("KEKW")).toBe(1);
    expect(reactionTokens("KEKW OMEGALUL")).toBe(2);
    expect(reactionTokens("lmaooo")).toBe(1);
    expect(reactionTokens("that was cool")).toBe(0);
  });

  it("ignores emote names embedded in other words", () => {
    expect(reactionTokens("POGGERSLIKE")).toBe(0);
  });
});

describe("chatWindowMetrics", () => {
  const msgs: ChatMessage[] = [
    { offset: 10, user: "a", text: "KEKW" },
    { offset: 11, user: "b", text: "KEKW" },
    { offset: 12, user: "c", text: "clip it" },
    { offset: 13, user: "a", text: "KEKW" },
    { offset: 50, user: "d", text: "hello" },
  ];

  it("measures velocity, unique chatters and callouts in range", () => {
    const m = chatWindowMetrics(msgs, 10, 20);
    expect(m.velocity).toBeCloseTo(0.4, 5);
    expect(m.uniqueChatters).toBe(3);
    expect(m.clipCallouts).toBe(1);
    expect(m.emoteRate).toBeGreaterThan(0);
  });

  it("detects a copypasta wave", () => {
    const m = chatWindowMetrics(msgs, 10, 20);
    // 3 of 4 messages are the same text.
    expect(m.copypasta).toBeCloseTo(0.75, 5);
  });

  it("returns zeros for an empty window", () => {
    const m = chatWindowMetrics(msgs, 100, 120);
    expect(m).toEqual({
      velocity: 0,
      uniqueChatters: 0,
      emoteRate: 0,
      copypasta: 0,
      clipCallouts: 0,
    });
  });
});

describe("scoreChatWindows", () => {
  const windows = Array.from({ length: 20 }, (_, i) => ({
    start: i * 30,
    end: i * 30 + 30,
  }));

  it("ranks the window where chat exploded highest", () => {
    const messages = [...baseline(600), ...hypeBurst(300)];
    const scores = scoreChatWindows(messages, windows);
    const best = scores.indexOf(
      scores.reduce((a, b) => (b.z > a.z ? b : a), scores[0]),
    );
    // The burst sits at 300s, which is window index 10.
    expect(best).toBe(10);
    expect(scores[10].detail).toMatch(/chat volume|hype emotes/i);
  });

  it("does not let one spammer outrank a real crowd", () => {
    const spam: ChatMessage[] = Array.from({ length: 240 }, (_, i) => ({
      offset: 60 + (i / 240) * 8,
      user: "sameguy",
      text: "KEKW",
    }));
    const messages = [...baseline(600), ...spam, ...hypeBurst(300)];
    const scores = scoreChatWindows(messages, windows);
    // Window 2 holds the single spammer, window 10 the genuine crowd.
    expect(scores[10].z).toBeGreaterThan(scores[2].z);
  });

  it("boosts a window where viewers explicitly ask for a clip", () => {
    const callouts: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({
      offset: 450 + i,
      user: `u${i}`,
      text: "someone clip that",
    }));
    const plain = scoreChatWindows(baseline(600), windows);
    const withCallouts = scoreChatWindows(
      [...baseline(600), ...callouts],
      windows,
    );
    expect(withCallouts[15].z).toBeGreaterThan(plain[15].z);
    expect(withCallouts[15].detail).toMatch(/asked to clip/i);
  });

  it("degrades cleanly with no chat at all", () => {
    const scores = scoreChatWindows([], windows);
    expect(scores).toHaveLength(windows.length);
    expect(scores.every((s) => s.z === 0)).toBe(true);
  });
});

describe("chat signals inside the clip finder", () => {
  const settings = { minDuration: 20, maxDuration: 40, maxClips: 3 };

  it("finds a clip from chat alone, with no audio or video signals", () => {
    const messages = [...baseline(600), ...hypeBurst(300)];
    const clips = findClipsFromSignals({ duration: 600, chat: messages }, settings);
    expect(clips.length).toBeGreaterThan(0);
    const top = clips[0];
    expect(top.start).toBeLessThanOrEqual(300);
    expect(top.end).toBeGreaterThanOrEqual(300);
    expect(top.signals?.some((s) => s.family === "chat")).toBe(true);
  });

  it("titles a clip after chat when chat is what fired", () => {
    const callouts: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      offset: 300 + i * 0.5,
      user: `u${i}`,
      text: "clip it",
    }));
    const clips = findClipsFromSignals(
      { duration: 600, chat: [...baseline(600), ...hypeBurst(300), ...callouts] },
      settings,
    );
    expect(clips[0].title).toMatch(/CHAT/);
  });

  it("lets chat outrank a loud moment that the audience ignored", () => {
    // Loud at 100s but chat is dead; quiet at 300s but chat erupts.
    const peaks = new Array(600).fill(0.1);
    for (let i = 100; i < 112; i++) peaks[i] = 0.95;
    const clips = findClipsFromSignals(
      {
        duration: 600,
        peaks,
        peaksDuration: 600,
        chat: [...baseline(600), ...hypeBurst(300, 8, 40)],
      },
      settings,
    );
    const top = clips[0];
    expect(top.start).toBeLessThanOrEqual(300);
    expect(top.end).toBeGreaterThanOrEqual(300);
  });
});
