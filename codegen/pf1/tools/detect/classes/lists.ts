/** A list as a class's page writes one: its items, split at its commas. */

/**
 * A list's items, split at its commas outside parentheses ("Knowledge (all skills, taken individually)" is one), each
 * trimmed, an "and" before its last left out: "Bonus feat, bravery +1" → ["Bonus feat", "bravery +1"].
 */
export function splitList(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map((item) => item.trim().replace(/^and /, "")).filter(Boolean);
}
