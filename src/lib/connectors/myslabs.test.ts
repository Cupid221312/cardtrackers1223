import { describe, it, expect } from "vitest";
import { _test } from "./myslabs";

const { extractItems, parsePrice, idFromUrl } = _test;

const gridHtml = `
<ul>
  <li>
    <article>
      <a href="/listing/987654321" title="2023 Panini Prizm Victor Wembanyama #136 PSA 10"></a>
      <h3 class="title">2023 Panini Prizm Victor Wembanyama #136 PSA 10</h3>
      <span class="price">$419.00</span>
    </article>
  </li>
  <li>
    <div class="card">
      <a href="https://www.myslabs.com/slab/wembanyama-prizm-psa-10-123456">Wembanyama Prizm PSA 10</a>
      <span class="listing-price">$450</span>
    </div>
  </li>
  <li>
    <a href="/listing/987654321">dup</a><span class="price">$500</span>
  </li>
</ul>`;

describe("myslabs parser", () => {
  it("parses listing prices with and without cents", () => {
    expect(parsePrice("$419.00")).toBe(419);
    expect(parsePrice("$1,499")).toBe(1499);
    expect(parsePrice("Make an offer")).toBeNull();
  });

  it("extracts unique items across container shapes and dedupes by id", () => {
    const items = extractItems(gridHtml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toContain("Wembanyama");
    expect(idFromUrl(items[1].url)).toBe("123456");
  });
});
