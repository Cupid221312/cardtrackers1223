import { describe, expect, it } from "vitest";
import { COLOR_GRADES, COLOR_GRADE_IDS } from "@/lib/colorGrades";

describe("color grades", () => {
  it("exposes a none grade with empty chains", () => {
    expect(COLOR_GRADES.none.vf).toBe("");
    expect(COLOR_GRADES.none.css).toBe("");
  });

  it("every non-none grade has both an ffmpeg chain and a css approximation", () => {
    for (const id of COLOR_GRADE_IDS) {
      if (id === "none") continue;
      expect(COLOR_GRADES[id].vf.length).toBeGreaterThan(0);
      expect(COLOR_GRADES[id].css.length).toBeGreaterThan(0);
    }
  });

  it("ffmpeg chains use only known safe filters (no shell metachars)", () => {
    for (const id of COLOR_GRADE_IDS) {
      const vf = COLOR_GRADES[id].vf;
      if (!vf) continue;
      // Only these filter names appear in the recipes.
      expect(vf).toMatch(/^(colorbalance|curves|eq|hue|,|[^;`$])+$/);
      expect(vf).not.toContain(";");
      expect(vf).not.toContain("`");
      expect(vf).not.toContain("$");
    }
  });
});
