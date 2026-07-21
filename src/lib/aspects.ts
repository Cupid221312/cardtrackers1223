/** Output aspect ratios. Width is fixed at 1080; height follows the ratio. */
export type AspectRatio = "9:16" | "4:5" | "1:1";

export interface AspectDims {
  width: number;
  height: number;
  label: string;
}

export const ASPECTS: Record<AspectRatio, AspectDims> = {
  "9:16": { width: 1080, height: 1920, label: "9:16 Vertical" },
  "4:5": { width: 1080, height: 1350, label: "4:5 Feed" },
  "1:1": { width: 1080, height: 1080, label: "1:1 Square" },
};

export const ASPECT_IDS = Object.keys(ASPECTS) as AspectRatio[];

export function aspectDims(a: AspectRatio): AspectDims {
  return ASPECTS[a] ?? ASPECTS["9:16"];
}
