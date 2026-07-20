import type { CaptionStyle, CaptionTemplateId } from "@/lib/types";

/**
 * Built-in caption aesthetics. Users pick a template, then fine-tune any
 * field in the inspector; the template id keeps the picker highlighted.
 */
export const CAPTION_TEMPLATES: Record<CaptionTemplateId, CaptionStyle> = {
  hormozi: {
    template: "hormozi",
    fontFamily: "Archivo Black",
    fontSize: 0.042,
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
  hormozi: "Hormozi Bold",
  clean: "Minimalist Clean",
  pop: "Chip Pop",
};
