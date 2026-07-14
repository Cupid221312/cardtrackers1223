/**
 * Flexible bulk-card parser. Auto-detects the input format so the user can
 * paste whatever they've got — CSV with headers, tab-separated (Excel copy),
 * pipe-delimited, or free-form like "2023 Prizm Victor Wembanyama #136".
 *
 * Every parsed row is validated against the same shape the /api/cards POST
 * uses. Rows that fail parsing come back in `errors` with a line number and
 * the reason, so the UI can show exactly which lines to fix instead of
 * silently swallowing them.
 */

export interface ParsedCard {
  playerName: string;
  year: number;
  setName: string;
  cardNumber: string;
  variant: string;
  sport: "Basketball" | "Football" | "Baseball" | "Hockey" | "Soccer" | "TCG" | "Other";
}

export interface ParseResult {
  cards: ParsedCard[];
  errors: { line: number; input: string; reason: string }[];
}

const SPORT_HINTS: [RegExp, ParsedCard["sport"]][] = [
  [/\b(nba|basketball|prizm|hoops|donruss|panini)\b/i, "Basketball"],
  [/\b(nfl|football|topps chrome nfl|prizm football)\b/i, "Football"],
  [/\b(mlb|baseball|topps chrome|bowman)\b/i, "Baseball"],
  [/\b(nhl|hockey|young guns|upper deck)\b/i, "Hockey"],
  [/\b(soccer|futbol|ucc|ucl|world cup|bundesliga|la liga|premier league)\b/i, "Soccer"],
  [/\b(pokemon|pokémon|tcg|magic|mtg|yugioh|yu-gi-oh|charizard|pikachu)\b/i, "TCG"],
];

function guessSport(text: string): ParsedCard["sport"] {
  for (const [re, sport] of SPORT_HINTS) if (re.test(text)) return sport;
  return "Other";
}

function normalizeSport(s: string): ParsedCard["sport"] {
  const t = s.trim().toLowerCase();
  if (t.startsWith("bask")) return "Basketball";
  if (t.startsWith("foot") || t === "nfl") return "Football";
  if (t.startsWith("base") || t === "mlb") return "Baseball";
  if (t.startsWith("hock") || t === "nhl") return "Hockey";
  if (t.startsWith("socc") || t === "futbol") return "Soccer";
  if (t === "tcg" || t === "pokemon" || t === "pokémon" || t === "magic" || t === "mtg") return "TCG";
  if (t === "other") return "Other";
  return guessSport(s);
}

/** Try to build a card from a row that already has separated fields. */
function fromFields(fields: string[], headers?: string[]): ParsedCard | null {
  const g = (name: string): string | undefined => {
    if (!headers) return undefined;
    const i = headers.findIndex((h) => h.trim().toLowerCase() === name);
    return i >= 0 ? fields[i]?.trim() : undefined;
  };
  if (headers) {
    const player = g("playername") ?? g("player") ?? g("name") ?? g("subject");
    const yearS = g("year");
    const setName = g("setname") ?? g("set");
    const cardNumber = g("cardnumber") ?? g("card_number") ?? g("number") ?? g("num") ?? g("#");
    const variantRaw = g("variant") ?? g("parallel") ?? "Base";
    const sportRaw = g("sport") ?? g("category");
    const year = Number(yearS);
    if (player && year && setName && cardNumber) {
      return {
        playerName: player,
        year,
        setName,
        cardNumber,
        variant: variantRaw || "Base",
        sport: sportRaw ? normalizeSport(sportRaw) : guessSport(`${setName} ${player}`),
      };
    }
    return null;
  }
  // No headers: assume order year, set, player, cardNumber, variant?, sport?
  if (fields.length < 4) return null;
  const [year, setName, playerName, cardNumber, variant, sport] = fields.map((f) => f.trim());
  const y = Number(year);
  if (!y || !setName || !playerName || !cardNumber) return null;
  return {
    playerName,
    year: y,
    setName,
    cardNumber,
    variant: variant || "Base",
    sport: sport ? normalizeSport(sport) : guessSport(`${setName} ${playerName}`),
  };
}

/**
 * Free-form parser: "2023 Prizm Victor Wembanyama #136 Basketball"
 * Grammar (best-effort): YEAR SET_NAME... PLAYER_NAME... #CARDNUMBER [SPORT]
 * We anchor on year (first 4-digit token) and card number (has # or is trailing).
 */
function fromFreeform(line: string): ParsedCard | null {
  const yearMatch = line.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);
  let rest = line.replace(yearMatch[0], "").trim();

  // Card number: prefer #123, else trailing token that looks like a number/id
  let cardNumber = "";
  const hashMatch = rest.match(/#\s*([A-Za-z0-9-]+)/);
  if (hashMatch) {
    cardNumber = hashMatch[1];
    rest = rest.replace(hashMatch[0], "").trim();
  }

  // Trailing sport hint
  let sport: ParsedCard["sport"] | null = null;
  const sportMatch = rest.match(/\b(basketball|football|baseball|hockey|soccer|tcg|pokemon|pokémon|nba|nfl|mlb|nhl)\b\s*$/i);
  if (sportMatch) {
    sport = normalizeSport(sportMatch[1]);
    rest = rest.slice(0, sportMatch.index).trim();
  }

  // Variant hints in trailing text
  let variant = "Base";
  const variantMatch = rest.match(/\b(silver|gold|refractor|holo|reverse holo|prizm|black|red|blue|green|orange|purple|pink|1st edition|shadowless)\b\s*$/i);
  if (variantMatch) {
    variant = variantMatch[1][0].toUpperCase() + variantMatch[1].slice(1).toLowerCase();
    rest = rest.slice(0, variantMatch.index).trim();
  }

  // Set + player: split so the first 1-3 words are the set, the rest is the player.
  // Common set names: Prizm, Topps Chrome, Bowman, Upper Deck Young Guns, Pokemon Base Set…
  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  const knownSets: [RegExp, number][] = [
    [/^Upper Deck Young Guns/i, 4],
    [/^Topps Chrome/i, 2],
    [/^Pokemon Base Set/i, 3],
    [/^(Prizm|Bowman|Donruss|Hoops|Select|Optic|Mosaic|Chronicles|Contenders)\b/i, 1],
  ];
  let setLen = 1;
  for (const [re, len] of knownSets) if (re.test(rest)) { setLen = len; break; }

  const setName = words.slice(0, setLen).join(" ");
  const playerName = words.slice(setLen).join(" ");
  if (!setName || !playerName) return null;

  if (!cardNumber) {
    // Fallback: no # was found — reject rather than guess
    return null;
  }

  return {
    playerName,
    year,
    setName,
    cardNumber,
    variant,
    sport: sport ?? guessSport(`${setName} ${playerName}`),
  };
}

function splitLine(line: string): { fields: string[]; delimiter: "csv" | "tab" | "pipe" | "none" } {
  if (line.includes("\t")) return { fields: line.split("\t"), delimiter: "tab" };
  if (line.includes("|")) return { fields: line.split("|"), delimiter: "pipe" };
  if (line.includes(",")) return { fields: parseCsvRow(line), delimiter: "csv" };
  return { fields: [line], delimiter: "none" };
}

/** Minimal RFC4180 csv row parser — handles quoted fields with commas. */
function parseCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inQ) {
      if (c === '"' && row[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"' && cur === "") inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseBulk(text: string): ParseResult {
  const cards: ParsedCard[] = [];
  const errors: ParseResult["errors"] = [];
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return { cards, errors };

  // Detect a header row by looking for known column names.
  const first = splitLine(rawLines[0]);
  const looksLikeHeader = first.delimiter !== "none" &&
    first.fields.some((f) => /^(player(name)?|year|set(name)?|card(_?number)?|number|variant|sport|category)$/i.test(f.trim()));
  const headers = looksLikeHeader ? first.fields.map((f) => f.trim().toLowerCase()) : undefined;
  const startIdx = looksLikeHeader ? 1 : 0;

  for (let i = startIdx; i < rawLines.length; i++) {
    const line = rawLines[i];
    const lineNum = i + 1;
    try {
      const split = splitLine(line);
      let card: ParsedCard | null = null;
      if (split.delimiter === "none") {
        card = fromFreeform(line);
      } else {
        card = fromFields(split.fields, headers);
      }
      if (!card) {
        errors.push({ line: lineNum, input: line, reason: "Couldn't parse — need at least year, set, player, card #" });
        continue;
      }
      cards.push(card);
    } catch (e) {
      errors.push({ line: lineNum, input: line, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { cards, errors };
}
