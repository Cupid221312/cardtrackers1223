import { describe, expect, it } from "vitest";
import { emphasisMarkers, sentimentIntensity } from "@/services/ai/sentiment";

describe("sentimentIntensity", () => {
  it("rates emotionally charged text hotter than neutral text", () => {
    const hot = sentimentIntensity(
      "This is absolutely insane and shocking, it completely destroyed me.",
    );
    const cold = sentimentIntensity(
      "We walked to the store and bought some bread on the way home.",
    );
    expect(hot).toBeGreaterThan(cold);
    expect(cold).toBeLessThan(0.2);
  });

  it("stays within 0..1 and is 0 for empty input", () => {
    expect(sentimentIntensity("")).toBe(0);
    const v = sentimentIntensity("amazing incredible unbelievable epic legendary");
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("treats positive and negative charge as equally intense", () => {
    const pos = sentimentIntensity("this is amazing and incredible");
    const neg = sentimentIntensity("this is terrible and horrible");
    expect(Math.abs(pos - neg)).toBeLessThan(0.25);
  });
});

describe("emphasisMarkers", () => {
  it("counts exclamations and shout-caps", () => {
    expect(emphasisMarkers("no way!! LOOK at this")).toBeGreaterThanOrEqual(3);
    expect(emphasisMarkers("a calm normal sentence")).toBe(0);
  });
});
