import { describe, expect, it } from "vitest";
import { buildAssDocument } from "@/lib/ffmpeg/ass";
import { CAPTION_TEMPLATES } from "@/lib/captionTemplates";
import type { CaptionLine } from "@/lib/types";

const line: CaptionLine = {
  id: "l0",
  start: 10,
  end: 11.5,
  words: [
    { id: "w0", text: "make", start: 10, end: 10.5 },
    { id: "w1", text: "money", start: 10.6, end: 11.5 },
  ],
};

const banner = {
  enabled: true,
  text: "THE TRUTH",
  bgColor: "#ffd400",
  textColor: "#000000",
  verticalPosition: 0.09,
};

describe("buildAssDocument", () => {
  it("emits clip-relative karaoke events per word", () => {
    const doc = buildAssDocument({
      lines: [line],
      style: CAPTION_TEMPLATES.hormozi,
      banner,
      clipStart: 10,
      clipEnd: 40,
    });
    // Two words → two caption dialogue events, plus the banner.
    const dialogues = doc.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogues).toHaveLength(3);
    // First word event starts at clip-relative 0.
    expect(doc).toContain("Dialogue: 1,0:00:00.00");
    // Uppercase transform applied.
    expect(doc).toContain("MAKE");
    // Active-word yellow (#ffd400 → &H0000D4FF) present in an override tag.
    expect(doc).toContain("\\c&H0000D4FF");
  });

  it("skips lines outside the clip window and banner when disabled", () => {
    const doc = buildAssDocument({
      lines: [line],
      style: CAPTION_TEMPLATES.clean,
      banner: { ...banner, enabled: false },
      clipStart: 20,
      clipEnd: 40,
    });
    expect(doc.split("\n").filter((l) => l.startsWith("Dialogue:"))).toHaveLength(0);
  });
});
