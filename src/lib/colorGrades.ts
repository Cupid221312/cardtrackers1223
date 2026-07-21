/**
 * One-click cinematic color grades. The FFmpeg filter chains are
 * reimplemented from OpenMontage's color-grading skill recipes (AGPLv3
 * docs — techniques sourced, not code copied) in the documented order:
 * colorbalance → curves → eq. Each grade also carries a CSS approximation
 * so the preview looks close to the burned export.
 */

export type ColorGradeId =
  | "none"
  | "warm"
  | "cool"
  | "vibrant"
  | "moody"
  | "vintage"
  | "bw";

export interface ColorGrade {
  id: ColorGradeId;
  label: string;
  /** FFmpeg filter chain applied after the user's eq, or "" for none. */
  vf: string;
  /** CSS filter approximation for the live preview. */
  css: string;
}

export const COLOR_GRADES: Record<ColorGradeId, ColorGrade> = {
  none: { id: "none", label: "None", vf: "", css: "" },
  warm: {
    id: "warm",
    label: "Cinematic Warm",
    vf: "colorbalance=rs=0.06:gs=0.02:bs=-0.04:rh=0.05:gh=0.01:bh=-0.03,eq=saturation=1.08:contrast=1.05",
    css: "sepia(0.18) saturate(1.1) contrast(1.05)",
  },
  cool: {
    id: "cool",
    label: "Cinematic Cool",
    vf: "colorbalance=rs=-0.03:gs=-0.01:bs=0.06:rh=-0.02:gh=0.01:bh=0.04,eq=contrast=1.06:saturation=0.95",
    css: "saturate(0.95) contrast(1.06) hue-rotate(-8deg) brightness(1.02)",
  },
  vibrant: {
    id: "vibrant",
    label: "Vibrant Punch",
    vf: "curves=all='0/0 0.15/0.08 0.5/0.52 0.85/0.92 1/1',eq=contrast=1.12:saturation=1.18",
    css: "saturate(1.2) contrast(1.12)",
  },
  moody: {
    id: "moody",
    label: "Moody",
    vf: "curves=all='0/0.04 0.25/0.22 0.5/0.47 0.75/0.73 1/0.94',eq=contrast=1.03:saturation=0.78:brightness=-0.02",
    css: "saturate(0.78) contrast(1.03) brightness(0.95)",
  },
  vintage: {
    id: "vintage",
    label: "Vintage Film",
    vf: "curves=all='0/0.05 0.5/0.5 1/0.92',colorbalance=rs=0.05:bh=-0.05,eq=saturation=0.85",
    css: "sepia(0.32) saturate(0.85) contrast(0.96)",
  },
  bw: {
    id: "bw",
    label: "Black & White",
    vf: "hue=s=0,eq=contrast=1.08",
    css: "grayscale(1) contrast(1.08)",
  },
};

export const COLOR_GRADE_IDS = Object.keys(COLOR_GRADES) as ColorGradeId[];
