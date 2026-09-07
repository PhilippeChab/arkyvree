import type { RequirementEntry, ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { normalizeDescription, MAX_DESC } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

export function toConstName(name: string): string {
  return name
    .replace(/[()'']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Indentation
// ---------------------------------------------------------------------------

export function indent(text: string, level: number): string {
  const prefix = "  ".repeat(level);
  return text.split("\n").map((line) => line ? prefix + line : line).join("\n");
}

// ---------------------------------------------------------------------------
// Requirement stringification
// ---------------------------------------------------------------------------

export function stringifyRequirement(
  req: RequirementEntry,
  indentLevel = 2,
): string {
  if ("chainingOperator" in req) {
    const fn = req.chainingOperator;
    const children = req.children.map((c) => stringifyRequirement(c, indentLevel + 1));
    if (children.length <= 3 && children.every((c) => c.length < 60)) {
      return `${fn}(${children.join(", ")})`;
    }
    return `${fn}(\n${children.map((c) => indent(c + ",", indentLevel + 1)).join("\n")}\n${indent(")", indentLevel)}`;
  }

  const { target, operator, value, valueType } = req;

  // Numeric comparisons
  if (valueType === "number") {
    const numVal = parseInt(value, 10);
    switch (operator) {
      case "greater_than_or_equal": return `gte("${target}", ${numVal})`;
      case "greater_than": return `gt("${target}", ${numVal})`;
      case "less_than_or_equal": return `lte("${target}", ${numVal})`;
      case "less_than": return `lt("${target}", ${numVal})`;
      case "equal": return `eqNum("${target}", ${numVal})`;
      case "not_equal": return `neNum("${target}", ${numVal})`;
    }
  }

  // String comparisons
  if (valueType === "string") {
    switch (operator) {
      case "equal": return `eqStr("${target}", "${escapeString(value)}")`;
      case "not_equal": return `neStr("${target}", "${escapeString(value)}")`;
    }
  }

  // Boolean
  if (valueType === "boolean") {
    if (operator === "equal" && value === "true") return `eq("${target}")`;
    if (operator === "not_equal" && value === "true") return `ne("${target}")`;
  }

  // Fallback — raw object
  return `{ target: "${target}", operator: "${operator}", value: "${value}", valueType: "${valueType}" }`;
}

// ---------------------------------------------------------------------------
// Modifier stringification
// ---------------------------------------------------------------------------

export function stringifyModifier(mod: ModifierSeed, indentLevel = 3): string {
  const parts = [
    `target: "${mod.target}"`,
    `operator: "${mod.operator}"`,
    `value: "${mod.value}"`,
    `valueType: "${mod.valueType}"`,
  ];
  if (mod.requirements && mod.requirements.length > 0) {
    const reqs = mod.requirements.map((r) => stringifyRequirement(r, indentLevel + 2));
    parts.push(`requirements: [${reqs.join(", ")}]`);
  }
  return `{ ${parts.join(", ")} }`;
}

// ---------------------------------------------------------------------------
// String escaping
// ---------------------------------------------------------------------------

export function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export const MAX_CLASS_DESC = MAX_DESC;

export function truncateDesc(text: string, maxLen = MAX_DESC): string {
  return normalizeDescription(text, maxLen);
}

// ---------------------------------------------------------------------------
// Array formatting
// ---------------------------------------------------------------------------

export function formatStringArray(items: string[], indentLevel = 1): string {
  const inner = items.map((s) => `"${escapeString(s)}"`).join(", ");
  if (inner.length < 100) return `[${inner}]`;
  const lines = items.map((s) => `${indent(`"${escapeString(s)}",`, indentLevel + 1)}`);
  return `[\n${lines.join("\n")}\n${indent("]", indentLevel)}`;
}
