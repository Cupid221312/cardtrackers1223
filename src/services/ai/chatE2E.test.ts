import { describe, expect, it } from "vitest";
import { findClips } from "@/services/ai/clipFinder";
import type { ChatMessage } from "@/services/ai/chatSignals";

/**
 * A realistic 30-minute stream: constant background chatter, one loud moment
 * the audience ignored, and one moment where chat erupts and asks for a clip.
 */
function streamFixture() {
  const duration = 1800;
  const chat: ChatMessage[] = [];
  for (let t = 0; t < duration; t += 0.8) {
    chat.push({ offset: t, user: `v${Math.floor(t) % 120}`, text: "gg" });
  }
  // Chat erupts at 1200s.
  for (let i = 0; i < 700; i++) {
    chat.push({
      offset: 1200 + (i / 700) * 12,
      user: `hype${i % 90}`,
      text: i % 3 === 0 ? "OMEGALUL" : i % 3 === 1 ? "KEKW" : "clip that",
    });
  }
  // Loud audio at 400s that nobody reacted to, plus mild loudness at 1200s.
  const peaks = new Array(1800).fill(0.12);
  for (let i = 400; i < 420; i++) peaks[i] = 0.99;
  for (let i = 1200; i < 1212; i++) peaks[i] = 0.4;
  return { duration, chat, peaks };
}

describe("chat-driven detection on a simulated Twitch VOD", () => {
  it("ranks the moment chat reacted to above the louder moment it ignored", () => {
    const { duration, chat, peaks } = streamFixture();
    const clips = findClips(null, { minDuration: 20, maxDuration: 45, maxClips: 5 }, {
      duration,
      peaks,
      peaksDuration: duration,
      chat,
    });
    expect(clips.length).toBeGreaterThan(0);
    const top = clips[0];
    expect(top.start).toBeLessThanOrEqual(1200);
    expect(top.end).toBeGreaterThanOrEqual(1200);
    expect(top.title).toMatch(/CHAT/);
    expect(top.signals?.some((s) => s.family === "chat")).toBe(true);
    // The explanation should name what chat actually did.
    expect(top.reason).toMatch(/chat volume|asked to clip/i);
  });

  it("still works on the same video with chat removed", () => {
    const { duration, peaks } = streamFixture();
    const clips = findClips(null, { minDuration: 20, maxDuration: 45, maxClips: 5 }, {
      duration,
      peaks,
      peaksDuration: duration,
    });
    expect(clips.length).toBeGreaterThan(0);
    // Without chat, the loud moment at 400s should win instead.
    expect(clips[0].start).toBeLessThanOrEqual(420);
  });
});
