import type * as requirementBuilders from "@/database/packages/dnd35/content/requirements.ts";
import type { ModifierSeed, RequirementCondition, RequirementEntry } from "@/database/packages/dnd35/content/types.ts";
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

function indent(text: string, level: number): string {
  const prefix = "  ".repeat(level);
  return text.split("\n").map((line) => line ? prefix + line : line).join("\n");
}

// ---------------------------------------------------------------------------
// Requirement stringification
// ---------------------------------------------------------------------------

/**
 * The builder (content/requirements.ts) the generated code writes a check with, by its value type and operator,
 * and its arguments. A check without one is written as an object.
 */
const CHECK_BUILDERS: Record<string, { builder: keyof typeof requirementBuilders; args: (check: RequirementCondition) => string } | undefined> = {
  "boolean equal": { builder: "eq", args: ({ target }) => `"${target}"` },
  "number equal": { builder: "eqNum", args: ({ target, value }) => `"${target}", ${parseInt(value, 10)}` },
  "number greater_than_or_equal": { builder: "gte", args: ({ target, value }) => `"${target}", ${parseInt(value, 10)}` },
  "string equal": { builder: "eqStr", args: ({ target, value }) => `"${target}", "${escapeString(value)}"` },
};

function checkBuilder(check: RequirementCondition) {
  // `eq` checks a flag is set: a boolean compared with anything else has no builder.
  if (check.valueType === "boolean" && check.value !== "true") return undefined;
  return CHECK_BUILDERS[`${check.valueType} ${check.operator}`];
}

/** Adds the builders a requirement is written with to `imports`. */
export function collectImportsFromReq(req: RequirementEntry, imports: Set<string>): void {
  if ("chainingOperator" in req) {
    imports.add(req.chainingOperator);
    for (const child of req.children) collectImportsFromReq(child, imports);
    return;
  }
  const builder = checkBuilder(req)?.builder;
  if (builder) imports.add(builder);
}

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

  const builder = checkBuilder(req);
  if (builder) return `${builder.builder}(${builder.args(req)})`;
  const { target, operator, value, valueType } = req;
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
