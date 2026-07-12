/**
 * Offline check of the eBay HTML parser against fixtures for both known
 * layouts, plus the title/grade matcher and price/date parsing.
 * Run: npm run check:parser
 */
import { extractItems, matchesCard, parsePrice, parseSoldDate } from "../src/lib/connectors/ebay";

let failures = 0;
function expect(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

// --- classic .s-item layout ---
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
const c = extractItems(classic);
expect("classic: placeholder dropped, 2 real items", c.length === 2);
expect("classic: title parsed", c[0].title.includes("Wembanyama #136 PSA 10"));
expect("classic: price parsed", parsePrice(c[0].priceText) === 412.5);
expect("classic: sold date parsed", parseSoldDate(c[0].captionText)?.toISOString().startsWith("2026-07-08") === true);
expect("classic: range price rejected", parsePrice(c[1].priceText) === null);

// --- newer .s-card layout ---
const card = `
<ul>
  <li class="s-card">
    <a href="https://www.ebay.com/itm/456789012345?var=0">link</a>
    <div class="s-card__title">2017 Panini Prizm Patrick Mahomes II #269 Rookie PSA 9 MINT</div>
    <span class="s-card__price">$1,234.99</span>
    <div class="s-card__caption">Sold Jul 10, 2026</div>
  </li>
</ul>`;
const k = extractItems(card);
expect("s-card: item extracted", k.length === 1);
expect("s-card: id from url", k[0].url.includes("456789012345"));
expect("s-card: comma price parsed", parsePrice(k[0].priceText) === 1234.99);

// --- matcher ---
expect("matcher: right card/grade", matchesCard("2023 Prizm Victor Wembanyama #136 PSA 10 GEM", "Victor Wembanyama", "PSA 10"));
expect("matcher: wrong grade rejected", !matchesCard("Wembanyama Prizm PSA 9", "Victor Wembanyama", "PSA 10"));
expect("matcher: PSA 10 not matching PSA 10.5-style", !matchesCard("Wembanyama BGS 9.5 not psa", "Victor Wembanyama", "PSA 10"));
expect("matcher: wrong player rejected", !matchesCard("2023 Prizm Chet Holmgren PSA 10", "Victor Wembanyama", "PSA 10"));
expect("matcher: hyphenated grade ok", matchesCard("Luka Doncic Prizm PSA-10", "Luka Doncic", "PSA 10"));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll parser checks passed.");
