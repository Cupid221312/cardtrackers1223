/**
 * Caption decoration: which words to auto-highlight, and which emoji to
 * attach to a word. Pure and deterministic so preview and the ASS export
 * make identical choices.
 */

// Words that carry emphasis in short-form speech — highlighting these is
// the "Submagic" look. Numbers and $ amounts always count.
const POWER_WORDS = new Set([
  "never", "always", "everyone", "nobody", "everything", "nothing",
  "best", "worst", "biggest", "huge", "massive", "insane", "crazy",
  "secret", "free", "now", "today", "stop", "must", "need", "proven",
  "guaranteed", "instantly", "fast", "easy", "hard", "million", "billion",
  "thousand", "percent", "money", "rich", "viral", "growth", "hack",
  "mistake", "truth", "wrong", "right", "first", "last", "only", "every",
]);

const NUMBER_RE = /^\$?\d[\d,.]*(k|m|b|x|%)?$/i;

/** Normalize a caption word to its comparable core (lowercase, no punct). */
function core(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9$%.]/g, "");
}

/** True if this word should be highlighted as an emphasis word. */
export function isKeyword(word: string): boolean {
  const c = core(word);
  if (!c) return false;
  return NUMBER_RE.test(c) || POWER_WORDS.has(c.replace(/[.,]/g, ""));
}

// Keyword → emoji. First match wins; substrings allow simple stemming
// ("money"→💰 also matches "moneys"). Kept small and unambiguous.
const EMOJI_MAP: Array<[RegExp, string]> = [
  [/\bmoney|cash|rich|dollar|profit|revenue\b/i, "💰"],
  [/\bfire|hot|lit|insane|crazy\b/i, "🔥"],
  [/\bgrow|growth|up|rise|scale|boom\b/i, "📈"],
  [/\bidea|think|smart|genius|brain\b/i, "💡"],
  [/\blove|heart|passion\b/i, "❤️"],
  [/\btime|fast|quick|now|today\b/i, "⏰"],
  [/\bwin|winner|success|champion\b/i, "🏆"],
  [/\bstop|no|never|don'?t\b/i, "🛑"],
  [/\bwarn|careful|danger|mistake|wrong\b/i, "⚠️"],
  [/\bstrong|power|muscle|gym|hard\b/i, "💪"],
  [/\bmind|shock|wow|mindblow\b/i, "🤯"],
  [/\bsecret|hidden|private\b/i, "🤫"],
  [/\bstar|best|top|amazing\b/i, "⭐"],
  [/\bmusic|song|sound\b/i, "🎵"],
  [/\brocket|launch|blast\b/i, "🚀"],
];

/** Emoji for a word, or "" if none applies. */
export function emojiFor(word: string): string {
  const c = core(word);
  if (!c) return "";
  for (const [re, emoji] of EMOJI_MAP) {
    if (re.test(c)) return emoji;
  }
  return "";
}
