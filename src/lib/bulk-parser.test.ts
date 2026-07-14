import { describe, it, expect } from "vitest";
import { parseBulk } from "./bulk-parser";

describe("parseBulk — format autodetect", () => {
  it("parses a CSV with headers", () => {
    const csv = `year,setName,playerName,cardNumber,variant,sport
2023,Prizm,Victor Wembanyama,136,Base,Basketball
2017,Prizm,Patrick Mahomes,269,Base,Football
1999,Pokemon Base Set,Charizard,4,Holo Unlimited,TCG`;
    const r = parseBulk(csv);
    expect(r.errors).toHaveLength(0);
    expect(r.cards).toHaveLength(3);
    expect(r.cards[0]).toMatchObject({ playerName: "Victor Wembanyama", year: 2023, cardNumber: "136", sport: "Basketball" });
  });

  it("parses tab-separated (Excel copy-paste)", () => {
    const tsv = "2023\tPrizm\tVictor Wembanyama\t136\tSilver\tBasketball";
    const r = parseBulk(tsv);
    expect(r.cards[0]).toMatchObject({ variant: "Silver", sport: "Basketball" });
  });

  it("parses pipe-delimited", () => {
    const t = "2018 | Prizm | Luka Doncic | 280 | Base | Basketball";
    const r = parseBulk(t);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].playerName).toBe("Luka Doncic");
  });

  it("parses free-form lines and infers sport", () => {
    const t = `2023 Prizm Victor Wembanyama #136 Basketball
2018 Topps Chrome Shohei Ohtani #150
1999 Pokemon Base Set Charizard #4`;
    const r = parseBulk(t);
    expect(r.cards).toHaveLength(3);
    expect(r.cards[1].sport).toBe("Baseball");   // inferred from "Topps Chrome"
    expect(r.cards[2].sport).toBe("TCG");        // inferred from "Charizard"
  });

  it("reports errors for unparseable lines", () => {
    const t = `2023 Prizm Wemby #136 Basketball
not a card at all`;
    const r = parseBulk(t);
    expect(r.cards).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].line).toBe(2);
  });

  it("skips a header row and processes only data", () => {
    const csv = `player,year,set,number,sport
Caitlin Clark,2024,Prizm WNBA,22,Basketball`;
    const r = parseBulk(csv);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0]).toMatchObject({ playerName: "Caitlin Clark", year: 2024, cardNumber: "22" });
  });
});
