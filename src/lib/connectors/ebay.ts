/**
 * eBay public search connector (no API key needed).
 *
 * Fetches sold comps and active Buy-It-Now listings from eBay's public search
 * pages for personal price research. Parsing handles both the classic
 * `.s-item` layout and the newer `.s-card` layout; if eBay changes markup and
 * a page yields zero items, the raw HTML is dumped to .debug/ so the selector
 * can be fixed quickly.
 *
 * Be polite: one request at a time with a delay (EBAY_REQUEST_DELAY_MS,
 * default 2000ms) — the refresh scheduler only touches a few cards per cycle.
 */
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

export interface EbaySoldItem {
  externalId: string;
  title: string;
  price: number;
  soldAt: Date;
  url: string;
}

export interface EbayActiveItem {
  externalId: string;
  title: string;
  price: number;
  url: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const delayMs = () => Number(process.env.EBAY_REQUEST_DELAY_MS ?? 2000);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchSearchPage(params: Record<string, string>): Promise<string> {
  const url = new URL("https://www.ebay.com/sch/i.html");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`eBay responded ${res.status} for ${url}`);
  await sleep(delayMs());
  return res.text();
}

export function parsePrice(text: string): number | null {
  // Skip ranges like "$10.00 to $20.00" — ambiguous.
  if (/\bto\b/i.test(text)) return null;
  const m = text.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const p = parseFloat(m[1]);
  return p >= 1 ? p : null;
}

export function parseSoldDate(text: string): Date | null {
  const m = text.match(/sold\s+(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
  return isNaN(d.getTime()) ? null : d;
}

function itemIdFromUrl(url: string): string | null {
  const m = url.match(/\/itm\/(?:[^/]*\/)?(\d{9,15})/);
  return m ? m[1] : null;
}

function dumpDebug(name: string, html: string) {
  try {
    const dir = path.join(process.cwd(), ".debug");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}-${Date.now()}.html`), html);
  } catch {
    /* debugging aid only */
  }
}

interface RawItem {
  title: string;
  url: string;
  priceText: string;
  captionText: string;
}

export function extractItems(html: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];

  // Classic layout
  $("li.s-item, div.s-item").each((_, el) => {
    const e = $(el);
    const title = e.find(".s-item__title").first().text().trim();
    const url = e.find("a.s-item__link").first().attr("href") ?? "";
    const priceText = e.find(".s-item__price").first().text().trim();
    const captionText = e
      .find(".s-item__caption, .s-item__title--tag, .POSITIVE, .s-item__ended-date")
      .text()
      .trim();
    if (title && url) items.push({ title, url, priceText, captionText });
  });

  // Newer card layout
  if (items.length === 0) {
    $("li.s-card, div.s-card").each((_, el) => {
      const e = $(el);
      const title = e.find(".s-card__title, .su-styled-text.primary").first().text().trim();
      const url = e.find("a[href*='/itm/']").first().attr("href") ?? "";
      const priceText = e.find(".s-card__price, .su-styled-text.bold").first().text().trim();
      const captionText = e.find(".s-card__caption, .su-styled-text.positive").text().trim();
      if (title && url) items.push({ title, url, priceText, captionText });
    });
  }

  // Last-resort: any anchor to /itm/ with a $ nearby.
  if (items.length === 0) {
    $("a[href*='/itm/']").each((_, el) => {
      const e = $(el);
      const container = e.closest("li, div");
      const title = e.text().trim() || container.find("h3, [role=heading]").first().text().trim();
      const priceText = container.text().match(/\$[\d,]+(?:\.\d{2})?/)?.[0] ?? "";
      const captionText = container.text();
      const url = e.attr("href") ?? "";
      if (title && url && priceText) items.push({ title, url, priceText, captionText });
    });
  }

  // De-dupe by item id, drop the "Shop on eBay" placeholder rows.
  const seen = new Set<string>();
  return items.filter((it) => {
    if (/^shop on ebay$/i.test(it.title)) return false;
    const id = itemIdFromUrl(it.url);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function fetchSoldItems(query: string): Promise<EbaySoldItem[]> {
  const html = await fetchSearchPage({
    _nkw: query,
    LH_Sold: "1",
    LH_Complete: "1",
    _ipg: "60",
    _sop: "13", // most recent first
  });
  const raw = extractItems(html);
  if (raw.length === 0) dumpDebug("sold-empty", html);

  const out: EbaySoldItem[] = [];
  for (const it of raw) {
    const price = parsePrice(it.priceText);
    const soldAt = parseSoldDate(it.captionText) ?? parseSoldDate(it.title);
    const externalId = itemIdFromUrl(it.url);
    if (price && soldAt && externalId) {
      out.push({ externalId, title: it.title, price, soldAt, url: it.url.split("?")[0] });
    }
  }
  return out;
}

export async function fetchActiveItems(query: string): Promise<EbayActiveItem[]> {
  const html = await fetchSearchPage({
    _nkw: query,
    LH_BIN: "1", // Buy It Now only, so the ask price is actionable
    _ipg: "60",
    _sop: "10", // newly listed first
  });
  const raw = extractItems(html);
  if (raw.length === 0) dumpDebug("active-empty", html);

  const out: EbayActiveItem[] = [];
  for (const it of raw) {
    const price = parsePrice(it.priceText);
    const externalId = itemIdFromUrl(it.url);
    if (price && externalId) {
      out.push({ externalId, title: it.title, price, url: it.url.split("?")[0] });
    }
  }
  return out;
}

/** Title must mention the grade and the player's last name to count as a comp. */
export function matchesCard(title: string, playerName: string, grade: string): boolean {
  const t = title.toLowerCase();
  const lastName = playerName.trim().split(/\s+/).pop()!.toLowerCase();
  if (!t.includes(lastName)) return false;
  const gm = grade.match(/^(\w+)\s+(\d+(?:\.\d)?)$/); // "PSA 10"
  if (!gm) return t.includes(grade.toLowerCase());
  const re = new RegExp(`${gm[1]}[\\s-]*${gm[2].replace(".", "\\.")}(?!\\d|\\.5)`, "i");
  return re.test(title);
}
