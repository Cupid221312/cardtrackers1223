/**
 * MySlabs connector — public marketplace for graded cards, no API key needed.
 *
 * MySlabs listings are all Buy-It-Now and PSA-focused, so this is a natural
 * second source for the active-listing side of the deal feed. It does not
 * expose a sold-history feed on its public pages, so `fetchSolds` returns
 * empty — the aggregate history is still supplied by eBay.
 *
 * If MySlabs redesigns their markup and a fetch parses zero items, the raw
 * HTML lands in .debug/ (same pattern as the eBay connector) so the
 * selectors can be updated with a single edit.
 */
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fetchText, HttpError } from "../http";
import type { ActiveItem, CardQuery, Connector, SoldItem } from "./types";
import { matchesCard } from "./ebay";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const delayMs = () => Number(process.env.MYSLABS_REQUEST_DELAY_MS ?? 2500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dumpDebug(name: string, html: string) {
  try {
    const dir = path.join(process.cwd(), ".debug");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}-${Date.now()}.html`), html);
  } catch {
    /* debug aid only */
  }
}

function parsePrice(text: string): number | null {
  const m = text.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const p = parseFloat(m[1]);
  return p >= 1 ? p : null;
}

function idFromUrl(url: string): string | null {
  const m = url.match(/\/(?:listing|item|slab)s?\/(\d+)/i) ?? url.match(/-(\d{5,})(?:\/|$)/);
  return m ? m[1] : null;
}

interface RawItem {
  title: string;
  url: string;
  priceText: string;
}

export function extractItems(html: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];

  // Card grid — anchors under listing cards. Structure evolves, so match generously.
  $("a[href*='/listing'], a[href*='/item'], a[href*='/slab']").each((_, el) => {
    const e = $(el);
    const url = e.attr("href") ?? "";
    if (!url) return;
    const container = e.closest("article, li, div.card, div[class*='listing']");
    const title = e.attr("title") || e.text().trim() || container.find("h2, h3, [class*='title']").first().text().trim();
    const priceText =
      container.find("[class*='price']").first().text().trim() ||
      container.text().match(/\$[\d,]+(?:\.\d{2})?/)?.[0] ||
      "";
    if (title && url && priceText) items.push({ title, url, priceText });
  });

  const seen = new Set<string>();
  return items.filter((it) => {
    const id = idFromUrl(it.url);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function fetchActiveItems(query: string): Promise<ActiveItem[]> {
  const url = new URL("https://www.myslabs.com/search/");
  url.searchParams.set("q", query);
  let html: string;
  try {
    html = await fetchText(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeoutMs: Number(process.env.MYSLABS_TIMEOUT_MS ?? 15_000),
      maxBytes: 5 * 1024 * 1024,
    });
  } catch (e) {
    // 404/410/blocked → treat as no results this cycle (per-connector isolation).
    if (e instanceof HttpError && e.status && e.status >= 400 && e.status < 500) return [];
    throw e;
  }
  await sleep(delayMs());

  const raw = extractItems(html);
  if (raw.length === 0) dumpDebug("myslabs-empty", html);

  const out: ActiveItem[] = [];
  for (const it of raw) {
    const price = parsePrice(it.priceText);
    const externalId = idFromUrl(it.url);
    if (price && externalId) {
      const absolute = it.url.startsWith("http") ? it.url : `https://www.myslabs.com${it.url}`;
      out.push({ externalId: `myslabs:${externalId}`, title: it.title, price, url: absolute.split("?")[0] });
    }
  }
  return out;
}

export const myslabsConnector: Connector = {
  source: "myslabs",
  enabled: process.env.MYSLABS_ENABLED !== "false",
  async fetchSolds(): Promise<SoldItem[]> {
    return []; // MySlabs public pages don't expose sold history.
  },
  async fetchActives(q: CardQuery) {
    const query = q.overrideQuery
      ? `${q.overrideQuery} ${q.grade}`
      : `${q.year} ${q.playerName} ${q.setName} ${q.cardNumber} ${q.grade}`;
    return (await fetchActiveItems(query)).filter((a) => matchesCard(a.title, q.playerName, q.grade));
  },
};

export const _test = { extractItems, parsePrice, idFromUrl };
