import { isDeepStrictEqual } from "node:util";

import { MAX_DESC, normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { eq, eqNum, eqStr, gte } from "@/database/packages/dnd35/content/requirements.ts";
import type {
  FeatSeed,
  Modifier,
  ModifierEffect,
  ModifierSeed,
  RequirementCondition,
  RequirementEntry,
} from "@/database/packages/dnd35/content/types.ts";

/** Modules and the names a generated file can import from them, in the order its imports list them. */
export type ImportTable = [string, string[]][];

export const MAX_CLASS_DESC = MAX_DESC;

// ---------------------------------------------------------------------------
// Requirement stringification
// ---------------------------------------------------------------------------

/** The builders of content/requirements.ts the generated code writes checks with. */
const BUILDERS = { eq, eqNum, gte, eqStr };

/** Each builder, with how it takes a check's value: not at all (`eq` checks a flag is set), as a number or a string. */
const CHECK_BUILDERS: { name: keyof typeof BUILDERS; takes: "nothing" | "number" | "string" }[] = [
  { name: "eq", takes: "nothing" },
  { name: "eqNum", takes: "number" },
  { name: "gte", takes: "number" },
  { name: "eqStr", takes: "string" },
];

/** The requirement builders a generated file imports. */
export const REQUIREMENT_IMPORTS: ImportTable = [
  ["@/database/packages/dnd35/content/requirements.ts", ["and", "eq", "eqNum", "eqStr", "feat", "gte", "or"]],
];

// ---------------------------------------------------------------------------
// Indentation
// ---------------------------------------------------------------------------

function indent(text: string, level: number): string {
  const prefix = "  ".repeat(level);
  return text
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}

// ---------------------------------------------------------------------------
// String escaping
// ---------------------------------------------------------------------------

function escapeString(s: string): string {
  // String(): a hand-typed reference can hold a number or a boolean where the seed has text
  return JSON.stringify(String(s)).slice(1, -1);
}

/** `s` as a string literal. */
export function quote(s: string): string {
  return `"${escapeString(s)}"`;
}

/**
 * The builder the generated code writes `check` with: one that builds that very check from its target and value. A
 * check none builds (another operator, a value that isn't a number's own writing) is written as an object.
 */
function builderOf(check: RequirementCondition) {
  // A hand-typed reference can hold a number where a check's value is its text
  const written = { ...check, value: String(check.value) };
  return CHECK_BUILDERS.find(({ name, takes }) => {
    const build: (target: string, value: string | number) => RequirementCondition = BUILDERS[name];
    return isDeepStrictEqual(
      build(written.target, takes === "number" ? Number(written.value) : written.value),
      written,
    );
  });
}

/** A check written with its builder: `builder(target, value)`. */
function builderCall(
  { target, value }: RequirementCondition,
  { name, takes }: (typeof CHECK_BUILDERS)[number],
): string {
  if (takes === "nothing") return `${name}(${quote(target)})`;
  return `${name}(${quote(target)}, ${takes === "number" ? Number(value) : quote(value)})`;
}

// ---------------------------------------------------------------------------
// Modifier stringification
// ---------------------------------------------------------------------------

/** A modifier's fields written as code, its target as `target`. */
function modifierFields(mod: ModifierEffect, target: string): string[] {
  return [
    `target: ${target}`,
    `operator: ${quote(mod.operator)}`,
    `value: ${quote(mod.value)}`,
    `valueType: ${quote(mod.valueType)}`,
  ];
}

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

/** `s` escaped for a template literal: as for a string literal, and its backticks and `${` too. */
export function escapeTemplate(s: string): string {
  return escapeString(s).replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

export function truncateDesc(text: string, maxLen = MAX_DESC): string {
  return normalizeDescription(text, maxLen);
}

/** The imports of the names a file's code uses (`uses`), from `table`. A name `table` doesn't list throws. */
export function importLines(uses: Set<string>, table: ImportTable): string[] {
  const unknown = [...uses].filter((name) => !table.some(([, names]) => names.includes(name)));
  if (unknown.length > 0) throw new Error(`The generated code uses ${unknown.join(", ")}, which no import provides`);
  return table.flatMap(([from, names]) => {
    const used = names.filter((name) => uses.has(name));
    return used.length > 0 ? [`import { ${used.join(", ")} } from "${from}";`] : [];
  });
}

/** The import of the requirement builders a file's code uses (`uses`), when it uses some. */
export function requirementImports(uses: Set<string>): string[] {
  return importLines(uses, REQUIREMENT_IMPORTS);
}

/**
 * `req` written as code. The builders it's written with are added to `uses`, the names the file's code uses, which
 * its imports are written from.
 */
export function stringifyRequirement(req: RequirementEntry, uses: Set<string>, indentLevel = 2): string {
  if ("chainingOperator" in req) {
    const fn = req.chainingOperator;
    uses.add(fn);
    const children = req.children.map((c) => stringifyRequirement(c, uses, indentLevel + 1));
    if (children.length <= 3 && children.every((c) => c.length < 60)) {
      return `${fn}(${children.join(", ")})`;
    }
    return `${fn}(\n${children.map((c) => indent(c + ",", indentLevel + 1)).join("\n")}\n${indent(")", indentLevel)}`;
  }

  const builder = builderOf(req);
  if (builder) {
    uses.add(builder.name);
    return builderCall(req, builder);
  }
  const { target, operator, value, valueType } = req;
  return `{ target: ${quote(target)}, operator: ${quote(operator)}, value: ${quote(value)}, valueType: ${quote(valueType)} }`;
}

/** A modifier written as code: a domain's, a race's or an item's, which has no requirements (only a feat's has). */
export function stringifyModifier(mod: Modifier): string {
  if ("requirements" in mod) throw new Error(`${mod.target}: only a feat's modifier has requirements`);
  return `{ ${modifierFields(mod, quote(mod.target)).join(", ")} }`;
}

/**
 * A feat's modifier written as code, at `indentLevel`: with its requirements, their builders added to `uses`
 * (`stringifyRequirement`). `target` is its target as code (a template's names each item).
 */
export function stringifyFeatModifier(
  mod: ModifierSeed,
  uses: Set<string>,
  indentLevel = 3,
  target = quote(mod.target),
): string {
  const requirements = (mod.requirements ?? []).map((r) => stringifyRequirement(r, uses, indentLevel));
  return `{ ${[...modifierFields(mod, target), ...(requirements.length > 0 ? [`requirements: [${requirements.join(", ")}]`] : [])].join(", ")} }`;
}

/** A `key: [...]` field of `items`, one per line, after `prefix` (its indentation); none when there are no items. */
export function listField(key: string, items: string[], prefix: string): string[] {
  return items.length === 0 ? [] : [`${prefix}${key}: [`, ...items.map((item) => `${prefix}  ${item},`), `${prefix}],`];
}

/** A property written as code. */
export function stringifyProperty({ type, value }: { type: string; value: string }): string {
  return `{ type: ${quote(type)}, value: ${quote(value)} }`;
}

/** A feat written as code, a list's item: its builders added to `uses` (`stringifyRequirement`). */
export function featLines(feat: FeatSeed, uses: Set<string>): string[] {
  return [
    `  {`,
    `    name: ${quote(feat.name)},`,
    `    description: ${quote(feat.description)},`,
    ...(feat.stackable ? [`    stackable: true,`] : []),
    ...(feat.selectable === false ? [`    selectable: false,`] : []),
    ...(feat.generated ? [`    generated: true,`] : []),
    `    aptitudes: [${feat.aptitudes.map(quote).join(", ")}],`,
    ...listField(
      "requirements",
      (feat.requirements ?? []).map((req) => stringifyRequirement(req, uses, 3)),
      "    ",
    ),
    ...listField(
      "modifiers",
      (feat.modifiers ?? []).map((m) => stringifyFeatModifier(m, uses)),
      "    ",
    ),
    ...listField("properties", (feat.properties ?? []).map(stringifyProperty), "    "),
    `  },`,
  ];
}

// ---------------------------------------------------------------------------
// Array formatting
// ---------------------------------------------------------------------------

export function formatStringArray(items: string[], indentLevel = 1): string {
  const inner = items.map(quote).join(", ");
  if (inner.length < 100) return `[${inner}]`;
  const lines = items.map((s) => indent(`${quote(s)},`, indentLevel + 1));
  return `[\n${lines.join("\n")}\n${indent("]", indentLevel)}`;
}
