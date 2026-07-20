import { describe, expect, it } from "vitest";
import { keyframeExpr, zoompanFilter } from "@/lib/ffmpeg/keyframes";
import type { ZoomKeyframe } from "@/lib/types";

const kf = (time: number, zoom: number, panX = 0, panY = 0): ZoomKeyframe => ({
  id: `kf-${time}`,
  time,
  zoom,
  panX,
  panY,
});

describe("keyframeExpr", () => {
  it("returns identity defaults with no keyframes", () => {
    expect(keyframeExpr([], "zoom", "t")).toBe("1");
    expect(keyframeExpr([], "panX", "t")).toBe("0");
  });

  it("returns a constant for a single keyframe", () => {
    expect(keyframeExpr([kf(2, 1.5)], "zoom", "t")).toBe("1.5000");
  });

  it("builds clamped piecewise segments in time order", () => {
    const expr = keyframeExpr([kf(4, 2), kf(1, 1)], "zoom", "(on/60)");
    // Clamps before the first keyframe (t=1) and switches at the second (t=4).
    expect(expr).toContain("if(lt((on/60),1.000),1.0000");
    expect(expr).toContain("if(lt((on/60),4.000)");
    // Interpolates from 1 with a delta of +1.
    expect(expr).toContain("(1.0000+1.0000*");
    // Balanced parens (sanity for the ffmpeg expression parser).
    const open = (expr.match(/\(/g) ?? []).length;
    const close = (expr.match(/\)/g) ?? []).length;
    expect(open).toBe(close);
  });

  it("contains no colons or whitespace that would break filter parsing", () => {
    const expr = keyframeExpr([kf(0, 1), kf(2, 1.8, 0.5, -0.5)], "panX", "(on/60)");
    expect(expr).not.toMatch(/[:\s]/);
  });
});

describe("zoompanFilter", () => {
  it("emits a complete zoompan clause", () => {
    const filter = zoompanFilter([kf(0, 1), kf(3, 2)], 1080, 1920, 60);
    expect(filter).toMatch(/^zoompan=z='/);
    expect(filter).toContain(":d=1:s=1080x1920:fps=60");
    expect(filter).toContain("(iw-iw/zoom)/2");
  });
});
