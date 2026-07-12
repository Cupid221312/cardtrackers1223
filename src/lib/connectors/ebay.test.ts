import { describe, it, expect } from "vitest";
import { extractItems, matchesCard, parsePrice, parseSoldDate } from "./ebay";

const classic = `
<ul>
  <li class="s-item">
    <a class="s-item__link" href="https://www.ebay.com/itm/123456789012?hash=x">x</a>
    <div class="s-item__title">Shop on eBay</div>
    <span class="s-item__price">$20.00</span>
  </li>
  <li class="s-item">
    <a class="s-item__link" href="https://www.ebay.com/itm/234567890123?hash=y">y</a>
    <div class="s-item__title">2023 Panini Prizm Victor Wembanyama #136 PSA 10 Rookie</div>
    <span class="s-item__price">$412.50</span>
    <div class="s-item__caption"><span class="POSITIVE">Sold  Jul 8, 2026</span></div>
  </li>
  <li class="s-item">
    <a class="s-item__link" href="https://www.ebay.com/itm/345678901234">z</a>
    <div class="s-item__title">Wembanyama lot PSA 9 &amp; raw</div>
    <span class="s-item__price">$100.00 to $150.00</span>
    <div class="s-item__caption">Sold Jun 30, 2026</div>
  </li>
</ul>`;

const cardLayout = `
<ul>
  <li class="s-card">
    <a href="https://www.ebay.com/itm/456789012345?var=0">link</a>
    <div class="s-card__title">2017 Panini Prizm Patrick Mahomes II #269 Rookie PSA 9 MINT</div>
    <span class="s-card__price">$1,234.99</span>
    <div class="s-card__caption">Sold Jul 10, 2026</div>
  </li>
</ul>`;

describe("extractItems", () => {
  it("parses the classic .s-item layout and drops the placeholder", () => {
    const items = extractItems(classic);
    expect(items).toHaveLength(2);
    expect(items[0].title).toContain("Wembanyama #136 PSA 10");
  });

  it("parses the newer .s-card layout", () => {
    const items = extractItems(cardLayout);
    expect(items).toHaveLength(1);
    expect(items[0].url).toContain("456789012345");
  });
});

describe("parsePrice", () => {
  it("parses a plain price", () => expect(parsePrice("$412.50")).toBe(412.5));
  it("parses a comma price", () => expect(parsePrice("$1,234.99")).toBe(1234.99));
  it("rejects a range", () => expect(parsePrice("$100.00 to $150.00")).toBeNull());
  it("rejects junk", () => expect(parsePrice("Best offer")).toBeNull());
});

describe("parseSoldDate", () => {
  it("parses a sold caption", () =>
    expect(parseSoldDate("Sold Jul 8, 2026")?.toISOString().startsWith("2026-07-08")).toBe(true));
  it("returns null without a date", () => expect(parseSoldDate("Buy It Now")).toBeNull());
});

describe("matchesCard", () => {
  it("matches the right player and grade", () =>
    expect(matchesCard("2023 Prizm Victor Wembanyama #136 PSA 10 GEM", "Victor Wembanyama", "PSA 10")).toBe(true));
  it("rejects the wrong grade", () =>
    expect(matchesCard("Wembanyama Prizm PSA 9", "Victor Wembanyama", "PSA 10")).toBe(false));
  it("rejects the wrong player", () =>
    expect(matchesCard("2023 Prizm Chet Holmgren PSA 10", "Victor Wembanyama", "PSA 10")).toBe(false));
  it("accepts a hyphenated grade", () =>
    expect(matchesCard("Luka Doncic Prizm PSA-10", "Luka Doncic", "PSA 10")).toBe(true));
});
