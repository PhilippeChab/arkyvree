/**
 * Shared utilities used across scraper, generator, and CLI tools.
 */

import { stripSeparators } from "@/shared/utils.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";
import { SIMPLE_WEAPONS, MARTIAL_WEAPONS } from "@/database/packages/dnd35/v1/feats/weapons.ts";
import { sanitizeText } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import type { RequirementEntry, ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Re-export stripSeparators — used as the slug function throughout the tools
export { stripSeparators } from "@/shared/utils.ts";

export { BOOK_ABBREV_PATTERN } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";

const COMPANION_GRANT_PATTERNS: {
  pattern: RegExp;
  aptitudeSlug: string;
  bondedKind: string;
}[] = [
  { pattern: /^Summon Familiar \((.+)\)$/, aptitudeSlug: "familiarbond", bondedKind: "familiar" },
  { pattern: /^Animal Companion \((.+)\)$/, aptitudeSlug: "animalcompanionbond", bondedKind: "animalcompanion" },
  { pattern: /^Special Mount \((.+)\)$/, aptitudeSlug: "specialmountbond", bondedKind: "mount" },
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * Extract the bonded-level contribution formula from a grant feat's SRD
 * description. The formula encodes how this class contributes to the
 * bonded creature's effective level.
 *
 *   "half his ranger level"              → floor(level / 2)
 *   "class level + N" / "level plus N"   → max(0, level + N)
 *   "N levels lower" / "N levels higher" → max(0, level ± N)
 *
 * Falls back to the 1:1 default (`[classes.<slug>.level]`) when no
 * pattern matches. Detection lets us avoid maintaining a hardcoded
 * per-feat override list — the SRD prose IS the spec.
 */
export function detectBondedLevelFormula(description: string, classSlug: string): string {
  const base = `[classes.${classSlug}.level]`;

  // "half ... level" (Ranger)
  if (/\bhalf\b[\w\s'.]*?\blevel\b/i.test(description)) {
    return `floor(${base} / 2)`;
  }

  // "level + N" / "level plus N" (Beastmaster)
  const plusMatch = description.match(/\blevel\s*(?:\+|plus)\s*(\d+)/i);
  if (plusMatch) {
    return `max(0, ${base} + ${plusMatch[1]})`;
  }
  const higherMatch = description.match(/(\d+|\w+)\s+levels?\s+higher/i);
  if (higherMatch) {
    const n = parseInt(higherMatch[1], 10) || NUMBER_WORDS[higherMatch[1].toLowerCase()];
    if (n) return `max(0, ${base} + ${n})`;
  }

  // "N levels lower" (Hexblade)
  const lowerMatch = description.match(/(\d+|\w+)\s+levels?\s+lower/i);
  if (lowerMatch) {
    const n = parseInt(lowerMatch[1], 10) || NUMBER_WORDS[lowerMatch[1].toLowerCase()];
    if (n) return `max(0, ${base} - ${n})`;
  }
  const minusMatch = description.match(/\blevel\s*(?:-|minus)\s*(\d+)/i);
  if (minusMatch) {
    return `max(0, ${base} - ${minusMatch[1]})`;
  }

  return base;
}

/**
 * Every class-feature feat matching one of these patterns emits two
 * modifiers: the aptitude grant so the picker UI unlocks, and a template
 * modifier on `bonded.<kind>.level` that adds the granting class's level
 * contribution. Stacking happens for free because each grant feat
 * independently adds to the same `bonded.<kind>.level` accumulator.
 *
 * The bonded-level formula is auto-detected from the SRD description via
 * `detectBondedLevelFormula`. Defaults to 1:1 when no pattern matches.
 */
export function autoCompanionGrantModifiers(featName: string, description: string = ""): ModifierSeed[] {
  const modifiers: ModifierSeed[] = [];
  for (const { pattern, aptitudeSlug, bondedKind } of COMPANION_GRANT_PATTERNS) {
    const match = featName.match(pattern);
    if (!match) continue;
    const className = match[1];
    const classSlug = className.toLowerCase().replace(/\s+/g, "");
    const formula = detectBondedLevelFormula(description, classSlug);

    modifiers.push({
      target: `aptitudes.${aptitudeSlug}.allowed`,
      operator: "add",
      value: "1",
      valueType: "number",
    });
    modifiers.push({
      target: `bonded.${bondedKind}.level`,
      operator: "add",
      value: `{{ ${formula} }}`,
      valueType: "number",
    });
  }
  return modifiers;
}

/**
 * Same as `autoCompanionGrantModifiers` but returns only the bonded-level
 * formula entry — used by the runtime backfill to add the contribution
 * modifier on existing grant feats.
 */
export function bondedLevelFormulaFor(
  featName: string,
  description: string = "",
): { bondedKind: string; value: string } | null {
  for (const { pattern, bondedKind } of COMPANION_GRANT_PATTERNS) {
    const match = featName.match(pattern);
    if (!match) continue;
    const className = match[1];
    const classSlug = className.toLowerCase().replace(/\s+/g, "");
    const formula = detectBondedLevelFormula(description, classSlug);
    return { bondedKind, value: `{{ ${formula} }}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// toCamelCase — used by scraper, generator
// ---------------------------------------------------------------------------

export function toCamelCase(name: string): string {
  return name
    .replace(/['']/g, "")
    .split(/[\s-]+/)
    .map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

// ---------------------------------------------------------------------------
// stripClassSuffix — used by buildSeeds, generator/class
// ---------------------------------------------------------------------------

/** Strip class suffix: "Track (Ranger)" → "Track" */
export function stripClassSuffix(name: string, className: string): string | undefined {
  const suffix = ` (${className})`;
  if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  return undefined;
}

// ---------------------------------------------------------------------------
// mergedFeatures — used by buildSeeds, generator/class
// ---------------------------------------------------------------------------

export function mergedFeatures(ref: ClassReference): ClassReference["mapping"]["features"] {
  const base = ref.mapping.features ?? {};
  const overrideFeatures = ref.mapping.overrides?.features;
  if (!overrideFeatures) return base;
  const result = structuredClone(base);
  for (const [name, fields] of Object.entries(overrideFeatures)) {
    if (name in result) {
      Object.assign(result[name], fields);
      for (const [k, v] of Object.entries(result[name])) {
        if (v === null) delete (result[name] as Record<string, unknown>)[k];
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[name] = fields as any;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// discoverRefs — used by sync, overrides
// ---------------------------------------------------------------------------

type RefMeta = { _meta: { type: string; sourceUrl?: string; book: string; filter?: string } };

export function discoverRefs(refDir: string): { path: string; type: string; url?: string; book: string; filter?: string }[] {
  const refs: { path: string; type: string; url?: string; book: string; filter?: string }[] = [];

  for (const book of readdirSync(refDir, { withFileTypes: true })) {
    if (!book.isDirectory()) continue;
    const bookDir = join(refDir, book.name);

    for (const entry of readdirSync(bookDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const catDir = join(bookDir, entry.name);
        for (const file of readdirSync(catDir)) {
          if (!file.endsWith(".json")) continue;
          const filePath = join(catDir, file);
          const data: RefMeta = JSON.parse(readFileSync(filePath, "utf-8"));
          refs.push({
            path: filePath,
            type: data._meta.type,
            url: data._meta.sourceUrl,
            book: data._meta.book,
            filter: data._meta.filter,
          });
        }
      } else if (entry.name.endsWith(".json")) {
        const filePath = join(bookDir, entry.name);
        const data: RefMeta = JSON.parse(readFileSync(filePath, "utf-8"));
        refs.push({
          path: filePath,
          type: data._meta.type,
          url: data._meta.sourceUrl,
          book: data._meta.book,
          filter: data._meta.filter,
        });
      }
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// sortKeysDeep — used by cleanupOverrides, diff
// ---------------------------------------------------------------------------

export function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// deepEqual — used by cleanupOverrides
// ---------------------------------------------------------------------------

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// SKILL_MAP — used by detectFeat, detectDomain
// ---------------------------------------------------------------------------

export const SKILL_MAP: Record<string, string> = {};
for (const name of SKILL_NAMES) {
  SKILL_MAP[name.toLowerCase()] = stripSeparators(name);
}

// ---------------------------------------------------------------------------
// collectImportsFromReq — used by generator/class, generator/feat
// ---------------------------------------------------------------------------

export function collectImportsFromReq(req: RequirementEntry, imports: Set<string>): void {
  if ("chainingOperator" in req) {
    imports.add(req.chainingOperator);
    for (const child of req.children) {
      collectImportsFromReq(child, imports);
    }
    return;
  }

  const { target, operator, valueType } = req;

  if (target.match(/^feats\..*\.possessed$/) && operator === "equal" && req.value === "true") {
    imports.add("eq");
    return;
  }

  if (valueType === "number") {
    switch (operator) {
      case "greater_than_or_equal": imports.add("gte"); break;
      case "greater_than": imports.add("gt"); break;
      case "less_than_or_equal": imports.add("lte"); break;
      case "less_than": imports.add("lt"); break;
      case "equal": imports.add("eqNum"); break;
      case "not_equal": imports.add("neNum"); break;
    }
    return;
  }

  if (valueType === "string") {
    switch (operator) {
      case "equal": imports.add("eqStr"); break;
      case "not_equal": imports.add("neStr"); break;
    }
    return;
  }

  if (valueType === "boolean") {
    if (operator === "equal") imports.add("eq");
    if (operator === "not_equal") imports.add("ne");
  }
}

// ---------------------------------------------------------------------------
// Plural variant helpers — used by buildSeeds, detectClass
// ---------------------------------------------------------------------------

export function pluralVariants(name: string): string[] {
  const n = name.toLowerCase();
  return [n, n + "s", n.replace(/y$/, "ies"), n.replace(/ies$/, "y"), n.replace(/s$/, "")];
}

export function matchesWithPluralVariants(a: string, b: string): boolean {
  return pluralVariants(a).includes(b.toLowerCase());
}

export function lookupWithPluralVariants<V>(map: Map<string, V>, name: string): V | undefined {
  for (const v of pluralVariants(name)) {
    const result = map.get(v);
    if (result !== undefined) return result;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// validateModifiers — used by detectFeat, detectDomain
// ---------------------------------------------------------------------------

export function validateModifiers(
  modifiers: ModifierSeed[],
  isValid: (target: string) => boolean,
): { validated: ModifierSeed[]; errors: string[] } {
  const validated: ModifierSeed[] = [];
  const errors: string[] = [];
  for (const m of modifiers) {
    if (isValid(m.target)) {
      validated.push(m);
    } else {
      errors.push(`Invalid modifier path "${m.target}": ${m.operator} ${m.value}`);
    }
  }
  return { validated, errors };
}

// ---------------------------------------------------------------------------
// Weapon sets — used by buildSeeds, generator/feat
// ---------------------------------------------------------------------------

export const SIMPLE_SET = new Set(SIMPLE_WEAPONS);
export const MARTIAL_SET = new Set(MARTIAL_WEAPONS);

// ---------------------------------------------------------------------------
// SAVE_MAP — used by detectFeat
// ---------------------------------------------------------------------------

const SAVE_NAMES = ["Fortitude", "Reflex", "Will"];

export const SAVE_MAP: Record<string, string> = {};
for (const name of SAVE_NAMES) {
  const slug = stripSeparators(name);
  SAVE_MAP[name.toLowerCase()] = slug;
  SAVE_MAP[`${name.toLowerCase()} saving`] = slug;
}

// ---------------------------------------------------------------------------
// Ordinal suffix — used by scraper/parsers, detectFeat, detectClass
// ---------------------------------------------------------------------------

/** Matches ordinal suffixes (1st, 2nd, 3rd, 4th, etc.) */
export const ORDINAL_SUFFIX = `(?:st|nd|rd|th)`;

// ---------------------------------------------------------------------------
// Template description expansion — used by buildSeeds, generator/feat
// ---------------------------------------------------------------------------

const WEAPON_DESC_PATTERNS = [
  /the selected weapon/gi,
  /selected weapon/gi,
  /the weapon you selected/gi,
];

export function expandTemplateDescription(description: string, type: string, item: string): string {
  if (type === "weapon" || type === "crossbow") {
    return WEAPON_DESC_PATTERNS.reduce((text, pattern) => text.replace(pattern, item), description);
  }
  if (type === "skill") {
    return description.replace(/that skill/gi, item);
  }
  if (type === "school") {
    return description.replace(/\{school\}/g, item);
  }
  return description;
}

// ---------------------------------------------------------------------------
// normalizeDescription — used by buildSeeds, codegen
// ---------------------------------------------------------------------------

/**
 * Capitalize the first letter of each word inside parentheses.
 * e.g. "Armor Proficiency (heavy)" → "Armor Proficiency (Heavy)"
 */
export function normalizeName(name: string): string {
  return name.replace(/\(([^)]+)\)/g, (_, inner: string) => {
    const capitalized = inner.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return `(${capitalized})`;
  });
}

export const MAX_DESC = 2000;

export function normalizeDescription(text: string, maxLen = MAX_DESC): string {
  const clean = sanitizeText(text)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > maxLen ? clean.substring(0, maxLen - 3).trim() + "..." : clean;
}

// ---------------------------------------------------------------------------
// parseCliArgs — used by sync, overrides, diff
// ---------------------------------------------------------------------------

export function parseCliArgs(): { bookFilter?: string; typeFilter?: string; nameFilter?: string; keyFilter?: string } {
  const args = process.argv.slice(2);

  const typeIdx = args.indexOf("--type");
  const typeFilter = typeIdx >= 0 ? args.splice(typeIdx, 2)[1] : undefined;

  const keyIdx = args.indexOf("--key");
  const keyFilter = keyIdx >= 0 ? args.splice(keyIdx, 2)[1] : undefined;

  const bookFilter = args[0];
  const nameFilter = args[1]?.toLowerCase();

  return { bookFilter, typeFilter, nameFilter, keyFilter };
}

// ---------------------------------------------------------------------------
// Bonus feat grant extraction from description text
// ---------------------------------------------------------------------------

/** Extract feat names from "gains/receives X as a [bonus] feat" patterns.
 *  Only matches definite grants, not choices ("may select") or parameterized refs. */
export function extractGrantedFeatNames(desc: string): string[] {
  const pattern = /(?:gains?|receives?|gets?)\s+(?:the\s+)?(.+?)\s+as a (?:bonus )?feat\b/gi;
  const names: string[] = [];
  let m;
  while ((m = pattern.exec(desc)) !== null) {
    const raw = m[1].trim();
    if (/\b(?:either|or|select|choose)\b/i.test(raw)) continue;
    if (/\b(?:for|corresponding|appropriate|related)\b/i.test(raw)) continue;
    const featName = raw
      .replace(/[,(]?\s*see page \d+\)?/gi, "")
      .replace(/\s+feat$/i, "")
      .trim();
    if (featName) names.push(featName);
  }
  return names;
}
