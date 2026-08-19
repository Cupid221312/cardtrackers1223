/**
 * Chat analysis — signal family D (roadmap §4), the wedge.
 *
 * On a stream, the audience has already voted on what was funny or insane
 * before any model looks at the footage. Transcript-only clippers miss it
 * entirely, and audio energy misses the moments where the streamer says
 * nothing and chat explodes. This module turns a time-aligned chat log into
 * per-window signals: how fast messages arrive, how many *distinct* people
 * are talking, whether hype emotes are spiking, whether a copypasta wave has
 * started, and whether people are literally asking for a clip.
 *
 * Pure and deterministic — the fetching lives elsewhere so this can be tested
 * against fixtures without a network.
 */

export interface ChatMessage {
  /** Seconds from the start of the VOD. */
  offset: number;
  /** Display name, used for unique-chatter counts. */
  user: string;
  text: string;
}

export interface ChatWindowMetrics {
  /** Messages per second. */
  velocity: number;
  /** Distinct people talking, which separates hype from one person spamming. */
  uniqueChatters: number;
  /** Hype-emote tokens per second. */
  emoteRate: number;
  /** Largest share of the window taken by one repeated message (0..1). */
  copypasta: number;
  /** Explicit "clip it" style requests in the window. */
  clipCallouts: number;
}

/**
 * Emotes that mark a *reaction* — something funny, shocking or impressive
 * just happened. Deliberately excludes conversational emotes (Kappa, and
 * greetings) which fire constantly and would flatten the signal.
 */
const HYPE_EMOTES = [
  "KEKW", "LULW", "LUL", "OMEGALUL", "KEK", "ICANT", "PepeLaugh",
  "POGGERS", "PogChamp", "PogU", "Pog", "POG", "HYPERS", "Poggers",
  "monkaS", "monkaW", "monkaGIGA", "Sadge", "GIGACHAD", "EZClap",
  "catJAM", "AYAYA", "WICKED", "Clap", "DEADASS", "NOWAY", "WHAT",
];
const EMOTE_RE = new RegExp(
  `(?:^|\\s)(${HYPE_EMOTES.join("|")})(?=\\s|$)`,
  "g",
);

/** Chat asking for the moment to be clipped is about as direct as it gets. */
const CLIP_CALLOUT_RE =
  /\b(clip (it|that|this)|clipped|someone clip|clip pls|clip please)\b/i;

/** Laughter spelled out, which carries the same signal as a laugh emote. */
const LAUGH_RE = /\b(lmao+|lmfao+|rofl|haha(?:ha)+|ja+ja+|xd+|💀+|😂+)\b/i;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Count hype-emote and written-laughter tokens in one message. */
export function reactionTokens(text: string): number {
  const emotes = text.match(EMOTE_RE)?.length ?? 0;
  const laughs = LAUGH_RE.test(text) ? 1 : 0;
  return emotes + laughs;
}

/** Normalize a message for copypasta comparison. */
function canonical(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Measure chat activity inside [start, end).
 *
 * Messages must be sorted by offset; callers pass the whole log and this
 * scans the relevant slice.
 */
export function chatWindowMetrics(
  messages: ChatMessage[],
  start: number,
  end: number,
): ChatWindowMetrics {
  const span = Math.max(0.001, end - start);
  const slice = messages.filter((m) => m.offset >= start && m.offset < end);
  if (slice.length === 0) {
    return {
      velocity: 0,
      uniqueChatters: 0,
      emoteRate: 0,
      copypasta: 0,
      clipCallouts: 0,
    };
  }

  const users = new Set<string>();
  const repeats = new Map<string, number>();
  let reactions = 0;
  let callouts = 0;

  for (const m of slice) {
    users.add(m.user);
    reactions += reactionTokens(m.text);
    if (CLIP_CALLOUT_RE.test(m.text)) callouts++;
    const key = canonical(m.text);
    if (key) repeats.set(key, (repeats.get(key) ?? 0) + 1);
  }

  const topRepeat = Math.max(0, ...repeats.values());

  return {
    velocity: slice.length / span,
    uniqueChatters: users.size,
    emoteRate: reactions / span,
    copypasta: topRepeat / slice.length,
    clipCallouts: callouts,
  };
}

/** Mean and standard deviation, guarding the all-equal case. */
function stats(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return { mean, sd: Math.sqrt(variance) || 1 };
}

export interface ChatScore {
  /** Fused chat strength as a z-score across the stream. */
  z: number;
  /** 0..100 for display. */
  strength: number;
  /** Plain-English summary of what chat did here. */
  detail: string;
  metrics: ChatWindowMetrics;
}

/**
 * Score every window's chat activity relative to the rest of the stream.
 *
 * Normalizing per stream matters: 20 messages/second is a dead chat for a
 * huge channel and a riot for a small one, so absolute thresholds would only
 * ever work for one size of streamer.
 */
export function scoreChatWindows(
  messages: ChatMessage[],
  windows: Array<{ start: number; end: number }>,
): ChatScore[] {
  if (messages.length === 0 || windows.length === 0) {
    return windows.map(() => ({
      z: 0,
      strength: 0,
      detail: "No chat data",
      metrics: {
        velocity: 0,
        uniqueChatters: 0,
        emoteRate: 0,
        copypasta: 0,
        clipCallouts: 0,
      },
    }));
  }

  const sorted = [...messages].sort((a, b) => a.offset - b.offset);
  const metrics = windows.map((w) => chatWindowMetrics(sorted, w.start, w.end));

  const velStats = stats(metrics.map((m) => m.velocity));
  const emoteStats = stats(metrics.map((m) => m.emoteRate));
  const userStats = stats(metrics.map((m) => m.uniqueChatters));

  return metrics.map((m) => {
    const zVel = (m.velocity - velStats.mean) / velStats.sd;
    const zEmote = (m.emoteRate - emoteStats.mean) / emoteStats.sd;
    const zUsers = (m.uniqueChatters - userStats.mean) / userStats.sd;

    // Unique chatters guards against a single spammer inflating velocity, so
    // it gets real weight rather than being a tiebreaker.
    let z = 0.4 * zVel + 0.35 * zEmote + 0.25 * zUsers;
    // A copypasta wave means chat locked onto one joke — a strong moment
    // marker, but only when several people joined in.
    if (m.copypasta > 0.3 && m.uniqueChatters >= 3) z += 0.5;
    // Nothing is more explicit than chat asking for the clip.
    if (m.clipCallouts > 0) z += Math.min(1, m.clipCallouts * 0.4);

    const parts: string[] = [];
    if (velStats.mean > 0 && m.velocity > velStats.mean * 1.3) {
      parts.push(`${(m.velocity / velStats.mean).toFixed(1)}x chat volume`);
    }
    if (m.emoteRate > 0 && zEmote > 0.5) {
      parts.push("hype emotes spiking");
    }
    if (m.copypasta > 0.3 && m.uniqueChatters >= 3) parts.push("copypasta wave");
    if (m.clipCallouts > 0) {
      parts.push(
        `${m.clipCallouts} viewer${m.clipCallouts === 1 ? "" : "s"} asked to clip it`,
      );
    }

    return {
      z,
      strength: Math.round(clamp01((z + 2) / 4) * 100),
      detail: parts.length > 0 ? parts.join(", ") : "Chat activity near normal",
      metrics: m,
    };
  });
}
