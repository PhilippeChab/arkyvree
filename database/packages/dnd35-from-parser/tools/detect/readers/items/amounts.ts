/** What an item costs and weighs, as the books' tables write it: "15 gp", "5 sp", "1½ lb.". */

/** An item's cost in gold pieces ("15 gp" → "15", "5 sp" → "0.5"): "0" when it has none ("—"). */
export function readCost(cost: string): string {
  if (!cost || cost === "—" || cost === "-") return "0";

  // Remove commas, footnote superscripts, parenthetical notes
  const cleaned = cost
    .replace(/,/g, "")
    .replace(/\(\d+\)/g, "")
    .trim();

  // Match value + unit: "15 gp", "+50 gp", "5 sp", "1 cp"
  const match = cleaned.match(/^\+?\s*([\d.]+)\s*(gp|sp|cp)/i);
  if (!match) return "0";

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "gp") return String(value);
  if (unit === "sp") return String(+(value / 10).toFixed(2));
  if (unit === "cp") return String(+(value / 100).toFixed(2));
  return "0";
}

/** An item's weight in pounds ("6 lb." → "6", "½ lb." → "0.5"): "0" when it has none ("—"). */
export function readWeight(weight: string): string {
  if (!weight || weight === "—" || weight === "-") return "0";

  // Strip footnote superscripts (trailing digits not part of the weight value)
  const cleaned = weight.replace(/lb\.?\s*\d*$/, "lb.").trim();

  // Handle ½ character
  if (cleaned.includes("½")) {
    const match = cleaned.match(/([\d.]*)\s*½/);
    const whole = match?.[1] ? parseFloat(match[1]) : 0;
    return String(whole + 0.5);
  }

  const match = cleaned.match(/([\d.]+)\s*lb/i);
  if (match) return String(parseFloat(match[1]));

  return "0";
}
