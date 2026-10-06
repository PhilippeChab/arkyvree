/** Names in title case, their small words (a, an, and…) aside. */

const LOWERCASE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "if",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
]);

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      // Always capitalize first word
      if (i === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      // Capitalize words starting with ( — e.g. "(Planar)"
      if (lower.startsWith("(")) return "(" + lower.charAt(1).toUpperCase() + lower.slice(2);
      // Keep articles/prepositions lowercase
      if (LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
