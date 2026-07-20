import type { CaptionStyle, CaptionTemplateId } from "@/lib/types";

/**
 * Built-in caption aesthetics. Users pick a template, then fine-tune any
 * field in the inspector; the template id keeps the picker highlighted.
 */
export const CAPTION_TEMPLATES: Record<CaptionTemplateId, CaptionStyle> = {
  // Instagram Reels "clean phrase" style: white medium-weight sentence-case
  // phrases in the upper-middle of the frame, thin outline + soft shadow,
  // no per-word highlighting.
  reels: {
    template: "reels",
    fontFamily: "Inter",
    fontSize: 0.028,
    fontWeight: 500,
    karaoke: false,
    uppercase: false,
    textColor: "#ffffff",
    activeColor: "#ffffff",
    activeBgColor: "",
    strokeColor: "#000000",
    strokeWidth: 0.06,
    shadow: true,
    verticalPosition: 0.28,
    maxWordsPerLine: 9,
  },
  hormozi: {
    template: "hormozi",
    fontFamily: "Archivo Black",
    fontSize: 0.042,
    fontWeight: 800,
    karaoke: true,
    uppercase: true,
    textColor: "#ffffff",
    activeColor: "#ffd400",
    activeBgColor: "",
    strokeColor: "#000000",
    strokeWidth: 0.16,
    shadow: true,
    verticalPosition: 0.72,
    maxWordsPerLine: 4,
  },
  clean: {
    template: "clean",
    fontFamily: "Inter",
    fontSize: 0.034,
    fontWeight: 600,
    karaoke: true,
    uppercase: false,
    textColor: "#ffffff",
    activeColor: "#ffffff",
    activeBgColor: "",
    strokeColor: "",
    strokeWidth: 0,
    shadow: true,
    verticalPosition: 0.78,
    maxWordsPerLine: 5,
  },
  pop: {
    template: "pop",
    fontFamily: "Archivo Black",
    fontSize: 0.038,
    fontWeight: 800,
    karaoke: true,
    uppercase: true,
    textColor: "#ffffff",
    activeColor: "#0c0e13",
    activeBgColor: "#2dd4a0",
    strokeColor: "#000000",
    strokeWidth: 0.1,
    shadow: false,
    verticalPosition: 0.74,
    maxWordsPerLine: 3,
  },
};

export const TEMPLATE_LABELS: Record<CaptionTemplateId, string> = {
  reels: "Reels Clean",
  hormozi: "Hormozi Bold",
  clean: "Minimal Karaoke",
  pop: "Chip Pop",
};
