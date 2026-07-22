/**
 * Tiny offline sentiment / emotional-arousal model. No API, no model
 * download — a compact hand-tuned lexicon (AFINN-style magnitudes) that
 * scores how emotionally charged a passage is. High-arousal speech (either
 * very positive or very negative) is what stops the scroll, so the clip
 * scorer uses *intensity* (absolute charge), not polarity.
 *
 * Kept deliberately small and dependency-free; it runs identically on the
 * client and server and costs zero credits.
 */

// word → magnitude (1..5). Sign encodes polarity; intensity uses |magnitude|.
const LEXICON: Record<string, number> = {
  // strong positive
  amazing: 4, incredible: 4, unbelievable: 4, awesome: 3, love: 3, best: 3,
  perfect: 3, huge: 3, massive: 3, winning: 3, breakthrough: 4, insane: 4,
  crazy: 3, wild: 3, obsessed: 4, unreal: 4, legendary: 4, epic: 3, brilliant: 3,
  genius: 3, powerful: 3, explode: 3, exploded: 3, skyrocket: 4, viral: 3,
  // strong negative (equally attention-grabbing)
  worst: 3, terrible: 4, horrible: 4, disaster: 4, nightmare: 4, brutal: 3,
  devastating: 4, shocking: 4, scared: 3, terrified: 4, furious: 4, angry: 3,
  hate: 4, painful: 3, humiliating: 4, embarrassing: 3, failed: 3, failure: 3,
  broke: 3, destroyed: 4, ruined: 4, dangerous: 3, illegal: 3, trapped: 3,
  // mid-charge / stakes
  secret: 2, mistake: 2, warning: 2, never: 2, always: 2, everyone: 2,
  nobody: 2, must: 2, urgent: 3, critical: 3, proven: 2, guaranteed: 3,
  shocked: 3, surprised: 2, mind: 2, blew: 3, stop: 2, truth: 2,
};

const INTENSIFIERS = new Set([
  "very", "so", "really", "absolutely", "literally", "completely", "totally",
  "insanely", "extremely", "seriously",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean);
}

/**
 * Emotional intensity of a passage, 0..1. Sums the absolute lexicon
 * magnitude of matched words (intensifier-boosted), normalizes by length so
 * long passages aren't unfairly rewarded, then squashes into 0..1.
 */
export function sentimentIntensity(text: string): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;
  let charge = 0;
  for (let i = 0; i < tokens.length; i++) {
    const mag = LEXICON[tokens[i]];
    if (mag === undefined) continue;
    const boost = i > 0 && INTENSIFIERS.has(tokens[i - 1]) ? 1.5 : 1;
    charge += Math.abs(mag) * boost;
  }
  // Charge per ~12 words → a couple of strong words already reads as hot.
  const density = charge / Math.max(tokens.length / 12, 1);
  // Saturating curve: diminishing returns past a handful of charged words.
  return Math.min(1, 1 - Math.pow(0.72, density));
}

/** Count of exclamation marks and ALL-CAPS shout words — raw hype markers. */
export function emphasisMarkers(text: string): number {
  const bangs = (text.match(/!/g) ?? []).length;
  const shouts = (text.match(/\b[A-Z]{3,}\b/g) ?? []).length;
  return bangs + shouts;
}
