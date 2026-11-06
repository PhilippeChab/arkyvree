/**
 * What an item costs and weighs, as the Core Rulebook's tables and stat blocks write it ("1,500 gp", "5 sp", "+50 gp",
 * "1-1/2 lbs.", "1 ton"), and an amount by variant where one line prices several ("2 sp (gallon), 4 cp (mug)").
 */

/** A coin's worth in gold pieces. */
const COINS: Record<string, number> = { cp: 0.01, gp: 1, pp: 10, sp: 0.1 };

/**
 * A cost, opening its text: an optional plus, a number as the book writes it ("1,500", "1/2", "1-1/2", "2½"), a coin.
 * A text that opens on words ("caster level × spell level × 10 gp") is a formula, no cost.
 */
const COST = /^\s*\+?\s*(\d[\d,]*(?:\.\d+)?(?:-\d+\/\d+|\/\d+)?½?)\s*(cp|sp|gp|pp)\b/i;

/** A weight's unit in pounds. */
const POUNDS: Record<string, number> = { lb: 1, lbs: 1, ton: 2000, tons: 2000 };

/** A weight, opening its text: an optional plus, a number as the book writes it, a unit. */
const WEIGHT = /^\s*\+?\s*(\d[\d,]*(?:\.\d+)?(?:-\d+\/\d+|\/\d+)?½?)\s*(lbs?|tons?)\b/i;

/** An amount a pattern reads (a number, a unit worth `units` of it), to the hundredth: 0 when it reads none. */
function readAmount(text: string, pattern: RegExp, units: Record<string, number>): number {
  const match = text.match(pattern);
  if (!match) return 0;
  return Math.round(readNumber(match[1]) * units[match[2].toLowerCase()] * 100) / 100;
}

/** A number the book writes ("1,500", "1/2", "1-1/2", "2½") as a number. */
function readNumber(text: string): number {
  const plain = text.replace(/,/g, "");
  const half = plain.endsWith("½") ? 0.5 : 0;
  const [whole, fraction] = plain.replace("½", "").split("-");
  const value = (part: string) => {
    const [numerator, denominator] = part.split("/");
    return denominator ? Number(numerator) / Number(denominator) : Number(numerator || 0);
  };
  return Math.round((value(whole) + (fraction ? value(fraction) : 0) + half) * 100) / 100;
}

/** A line's parts: its text split at each comma outside parentheses ("2 sp (common, per day), 1 sp (poor, per day)"). */
function splitParts(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth = Math.max(0, depth - 1);
    } else if (text[i] === "," && depth === 0 && /\s/.test(text[i + 1] ?? "")) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, text.slice(start)].map((part) => part.trim());
}

/** An item's cost in gold pieces ("15 gp" → 15, "5 sp" → 0.5, "+50 gp" → 50): 0 when it gives none ("—", ""). */
export function readCost(text: string): number {
  return readAmount(text, COST, COINS);
}

/**
 * The amounts a line gives each variant, by the variant's note, lowercase: the note in parentheses after its amount ("2
 * sp (gallon), 4 cp (mug)": gallon's "2 sp"), or the amount in parentheses after its note ("lesser (16,012 gp)"). None
 * when the line gives a single amount.
 */
export function readVariantAmounts(text: string): Map<string, string> {
  const variants = new Map<string, string>();
  for (const part of splitParts(text)) {
    const match = part.match(/^(.*?)\s*\(([^)]+)\)$/);
    if (!match) continue;
    const [, head, inner] = match;
    const innerIsAmount = (COST.test(inner) || WEIGHT.test(inner)) && !COST.test(head) && !WEIGHT.test(head);
    if (innerIsAmount) variants.set(head.toLowerCase(), inner);
    else variants.set(inner.trim().toLowerCase(), head);
  }
  return variants;
}

/** An item's weight in pounds ("6 lbs." → 6, "1/2 lb." → 0.5, "1 ton" → 2000): 0 when it gives none ("—", ""). */
export function readWeight(text: string): number {
  return readAmount(text, WEIGHT, POUNDS);
}
