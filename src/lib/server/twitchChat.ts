import type { ChatMessage } from "@/services/ai/chatSignals";

/**
 * Twitch VOD chat replay, time-aligned to the video.
 *
 * This is what feeds signal family D — the audience's own reaction to the
 * moment, which is the strongest highlight predictor on a stream and the
 * thing transcript-only clippers cannot see.
 *
 * Uses the same public GraphQL endpoint the web player uses for chat replay.
 * It needs no user account and no API key, but it is an undocumented endpoint,
 * so every failure here is non-fatal: clip detection falls back to audio and
 * motion signals when chat is unavailable.
 */

const GQL_URL = "https://gql.twitch.tv/gql";
/** The public web client id, the same one the Twitch site ships to browsers. */
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
/** Persisted-query hash for VideoCommentsByOffsetOrCursor. */
const QUERY_HASH =
  "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a";

/** Extract the numeric video id from any Twitch VOD URL form. */
export function twitchVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "twitch.tv" && !host.endsWith(".twitch.tv")) return null;
    const m = url.pathname.match(/\/videos\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

interface CommentNode {
  contentOffsetSeconds?: number;
  commenter?: { displayName?: string; login?: string } | null;
  message?: { fragments?: Array<{ text?: string }> } | null;
}

/** Flatten one GraphQL comment node into a ChatMessage. */
function toMessage(node: CommentNode): ChatMessage | null {
  const offset = node.contentOffsetSeconds;
  if (typeof offset !== "number") return null;
  const text = (node.message?.fragments ?? [])
    .map((f) => f?.text ?? "")
    .join("")
    .trim();
  if (!text) return null;
  return {
    offset,
    user: node.commenter?.displayName || node.commenter?.login || "anon",
    text,
  };
}

/**
 * Page through a VOD's chat replay.
 *
 * `maxMessages` bounds memory and time on long VODs — a 6-hour stream can
 * carry hundreds of thousands of messages, and the signal is just as clear
 * from a large sample.
 */
export async function fetchTwitchVodChat(
  videoId: string,
  { maxMessages = 60_000, signal }: { maxMessages?: number; signal?: AbortSignal } = {},
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];
  let cursor: string | null = null;
  let offsetSeconds: number | null = 0;

  // Hard cap on requests as a backstop against an unexpected cursor loop.
  for (let page = 0; page < 400 && messages.length < maxMessages; page++) {
    const variables: Record<string, unknown> = { videoID: videoId };
    if (cursor) variables.cursor = cursor;
    else variables.contentOffsetSeconds = offsetSeconds ?? 0;

    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        "Client-ID": CLIENT_ID,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify([
        {
          operationName: "VideoCommentsByOffsetOrCursor",
          variables,
          extensions: {
            persistedQuery: { version: 1, sha256Hash: QUERY_HASH },
          },
        },
      ]),
    });
    if (!res.ok) throw new Error(`Twitch chat request failed (${res.status})`);

    const body = await res.json();
    const comments = body?.[0]?.data?.video?.comments;
    const edges: Array<{ node?: CommentNode; cursor?: string }> =
      comments?.edges ?? [];
    if (edges.length === 0) break;

    for (const edge of edges) {
      const msg = edge.node ? toMessage(edge.node) : null;
      if (msg) messages.push(msg);
    }

    if (!comments?.pageInfo?.hasNextPage) break;
    cursor = edges[edges.length - 1]?.cursor ?? null;
    if (!cursor) break;
    offsetSeconds = null;
  }

  messages.sort((a, b) => a.offset - b.offset);
  return messages;
}

/**
 * Best-effort chat pull for a source URL. Returns an empty array for
 * platforms or URLs without retrievable chat, so callers can treat chat as an
 * optional bonus signal rather than a hard dependency.
 */
export async function fetchChatForUrl(
  rawUrl: string,
  opts?: { maxMessages?: number; signal?: AbortSignal },
): Promise<ChatMessage[]> {
  const videoId = twitchVideoId(rawUrl);
  if (!videoId) return [];
  try {
    return await fetchTwitchVodChat(videoId, opts);
  } catch (err) {
    console.error("[chat] could not fetch Twitch VOD chat:", err);
    return [];
  }
}
