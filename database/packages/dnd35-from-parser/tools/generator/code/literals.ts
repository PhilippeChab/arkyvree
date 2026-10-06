/** Values written as code: a string as a literal, a list an item per line, a name as a constant's. */

import { MAX_DESC, normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text.ts";

export const MAX_CLASS_DESC = MAX_DESC;

function escapeString(s: string): string {
  // String(): a hand-typed reference can hold a number or a boolean where the seed has text
  return JSON.stringify(String(s)).slice(1, -1);
}

/** `s` escaped for a template literal: as for a string literal, and its backticks and `${` too. */
export function escapeTemplate(s: string): string {
  return escapeString(s).replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

export function formatStringArray(items: string[], indentLevel = 1): string {
  const inner = items.map(quote).join(", ");
  if (inner.length < 100) return `[${inner}]`;
  const lines = items.map((s) => indent(`${quote(s)},`, indentLevel + 1));
  return `[\n${lines.join("\n")}\n${indent("]", indentLevel)}`;
}

export function indent(text: string, level: number): string {
  const prefix = "  ".repeat(level);
  return text
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}

/** A `key: [...]` field of `items`, one per line, after `prefix` (its indentation); none when there are no items. */
export function listField(key: string, items: string[], prefix: string): string[] {
  return items.length === 0 ? [] : [`${prefix}${key}: [`, ...items.map((item) => `${prefix}  ${item},`), `${prefix}],`];
}

/** `s` as a string literal. */
export function quote(s: string): string {
  return `"${escapeString(s)}"`;
}

export function toConstName(name: string): string {
  return name
    .replace(/[()'']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

export function truncateDesc(text: string, maxLen = MAX_DESC): string {
  return normalizeDescription(text, maxLen);
}
