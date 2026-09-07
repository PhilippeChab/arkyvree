import { eq as drizzleEq } from "drizzle-orm";
import { featsInRules, modifiersInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { stripSeparators } from "@/shared/utils.ts";
import type { RequirementCondition, RequirementEntry, RequirementGroup } from "@/database/packages/dnd35/v1/feats/types.ts";

// ---------------------------------------------------------------------------
// Data-definition helpers (used in feat seed files)
// ---------------------------------------------------------------------------

export const feat = (name: string) =>
  `feats.${stripSeparators(name)}.possessed`;

// Chaining operators
export const or = (...children: RequirementEntry[]): RequirementGroup => ({ chainingOperator: "or", children });
export const and = (...children: RequirementEntry[]): RequirementGroup => ({ chainingOperator: "and", children });

// Boolean
export const eq = (target: string): RequirementCondition =>
  ({ target, operator: "equal", value: "true", valueType: "boolean" });
export const ne = (target: string): RequirementCondition =>
  ({ target, operator: "not_equal", value: "true", valueType: "boolean" });

// Numeric comparisons
export const eqNum = (target: string, value: number): RequirementCondition =>
  ({ target, operator: "equal", value: String(value), valueType: "number" });
export const neNum = (target: string, value: number): RequirementCondition =>
  ({ target, operator: "not_equal", value: String(value), valueType: "number" });
export const gt = (target: string, value: number): RequirementCondition =>
  ({ target, operator: "greater_than", value: String(value), valueType: "number" });
export const lt = (target: string, value: number): RequirementCondition =>
  ({ target, operator: "less_than", value: String(value), valueType: "number" });
export const gte = (target: string, value: number): RequirementCondition =>
  ({ target, operator: "greater_than_or_equal", value: String(value), valueType: "number" });
export const lte = (target: string, value: number): RequirementCondition =>
  ({ target, operator: "less_than_or_equal", value: String(value), valueType: "number" });

// Class level requirement
export const classReq = (className: string, level: number): RequirementCondition =>
  ({ target: `classes.${className}.level`, operator: "greater_than_or_equal", value: String(level), valueType: "number" });

// String comparisons
export const eqStr = (target: string, value: string): RequirementCondition =>
  ({ target, operator: "equal", value, valueType: "string" });
export const neStr = (target: string, value: string): RequirementCondition =>
  ({ target, operator: "not_equal", value, valueType: "string" });
export const contains = (target: string, value: string): RequirementCondition =>
  ({ target, operator: "contains", value, valueType: "string" });
export const notContains = (target: string, value: string): RequirementCondition =>
  ({ target, operator: "not_contains", value, valueType: "string" });
export const startsWith = (target: string, value: string): RequirementCondition =>
  ({ target, operator: "starts_with", value, valueType: "string" });
export const endsWith = (target: string, value: string): RequirementCondition =>
  ({ target, operator: "ends_with", value, valueType: "string" });
export const matchesRegex = (target: string, value: string): RequirementCondition =>
  ({ target, operator: "matches_regex", value, valueType: "string" });
export const notMatchesRegex = (target: string, value: string): RequirementCondition =>
  ({ target, operator: "not_matches_regex", value, valueType: "string" });
export const isEmpty = (target: string): RequirementCondition =>
  ({ target, operator: "is_empty", value: "", valueType: "string" });
export const notEmpty = (target: string): RequirementCondition =>
  ({ target, operator: "not_empty", value: "", valueType: "string" });

// ---------------------------------------------------------------------------
// BAB / Save progression functions
// ---------------------------------------------------------------------------

export function goodSave(level: number): number {
  return Math.floor(level / 2) + 2;
}

export function poorSave(level: number): number {
  return Math.floor(level / 3);
}

export function mediumBab(level: number): number {
  return Math.floor(level * 3 / 4);
}

export function poorBab(level: number): number {
  return Math.floor(level / 2);
}

// ---------------------------------------------------------------------------
// Spell table helpers
// ---------------------------------------------------------------------------

export function computeDeltas(table: number[][]): { level: number; spellLevel: number; delta: number }[] {
  const deltas: { level: number; spellLevel: number; delta: number }[] = [];
  for (let lvl = 0; lvl < table.length; lvl++) {
    const row = table[lvl];
    const prev = lvl > 0 ? table[lvl - 1] : [];
    for (let sl = 0; sl < row.length; sl++) {
      const delta = row[sl] - (prev[sl] ?? 0);
      if (delta > 0) {
        deltas.push({ level: lvl + 1, spellLevel: sl, delta });
      }
    }
  }
  return deltas;
}

export function newSpellLevels(table: number[][]): { level: number; spellLevel: number }[] {
  const result: { level: number; spellLevel: number }[] = [];
  for (let lvl = 0; lvl < table.length; lvl++) {
    const prevLen = lvl > 0 ? table[lvl - 1].length : 0;
    for (let sl = prevLen; sl < table[lvl].length; sl++) {
      result.push({ level: lvl + 1, spellLevel: sl });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// parseSavingThrow — shared between v1/powers and v2/domains
// ---------------------------------------------------------------------------

export function parseSavingThrow(
  savingThrow: string,
  saveMap: Record<string, string>,
): { saveId: string | null; saveEffect: string | null } {
  if (!savingThrow || savingThrow === "None") {
    return { saveId: null, saveEffect: null };
  }
  const match = savingThrow.match(/^(Will|Reflex|Fortitude)\s+(.+)$/);
  if (!match) {
    return { saveId: null, saveEffect: savingThrow };
  }
  const [, saveName, effect] = match;
  return { saveId: saveMap[saveName] ?? null, saveEffect: effect };
}

// ---------------------------------------------------------------------------
// buildRequirements — hierarchy builder for feat/power requirement entries
// ---------------------------------------------------------------------------

type RequirementRow = {
  entityId: string;
  entityType: string;
  level: string;
  target?: string | null;
  operator?: string | null;
  value?: string | null;
  valueType?: string | null;
  chainingOperator?: string | null;
};

export function buildRequirements(
  entityId: string,
  entityType: string,
  entries: RequirementEntry[],
): RequirementRow[] {
  const result: RequirementRow[] = [];
  let rootIndex = 0;

  function walk(entry: RequirementEntry, prefix: string) {
    if ("chainingOperator" in entry) {
      result.push({ entityId, entityType, level: prefix, chainingOperator: entry.chainingOperator });
      let childIndex = 0;
      for (const child of entry.children) {
        childIndex++;
        walk(child, `${prefix}.${childIndex}`);
      }
    } else {
      result.push({ entityId, entityType, level: prefix, ...entry });
    }
  }

  for (const entry of entries) {
    rootIndex++;
    walk(entry, String(rootIndex));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Class → DC ability mapping for D&D 3.5 spellcasters
// ---------------------------------------------------------------------------

type SpellcastingClass = { name: string; bonusSpellAbility?: string; spells?: { perDay: number[][]; noCantrips?: boolean } };

export function buildClassDcAbility(abilityMap: Record<string, string>, classes: SpellcastingClass[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cls of classes) {
    if (cls.bonusSpellAbility && abilityMap[cls.bonusSpellAbility]) {
      map[cls.name] = abilityMap[cls.bonusSpellAbility];
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// buildClassSpellLevels — derive spell level → min class level from perDay
// ---------------------------------------------------------------------------

export function buildClassSpellLevels(classes: SpellcastingClass[]): Record<string, Record<number, number>> {
  const map: Record<string, Record<number, number>> = {};
  for (const cls of classes) {
    if (!cls.spells) continue;
    const levels: Record<number, number> = {};
    const offset = cls.spells.noCantrips ? 1 : 0;
    for (let classLevel = 0; classLevel < cls.spells.perDay.length; classLevel++) {
      const row = cls.spells.perDay[classLevel];
      for (let i = 0; i < row.length; i++) {
        const spellLevel = i + offset;
        if (row[i] !== undefined && !(spellLevel in levels)) {
          levels[spellLevel] = classLevel + 1; // classLevel is 0-indexed, class levels are 1-indexed
        }
      }
    }
    map[cls.name] = levels;
  }
  return map;
}

// ---------------------------------------------------------------------------
// addFeatModifiers — backfill modifiers onto existing feats (for updates)
// ---------------------------------------------------------------------------

export async function addFeatModifiers(
  db: Db,
  rulesetId: string,
  entries: { feat: string; modifiers: { target: string; operator: string; value: string; valueType: string }[] }[],
): Promise<void> {
  const feats = await db
    .select({ id: featsInRules.id, name: featsInRules.name })
    .from(featsInRules)
    .where(drizzleEq(featsInRules.rulesetId, rulesetId));

  const featMap = Object.fromEntries(feats.map((f) => [f.name, f.id]));

  const modifiers = entries
    .filter((e) => featMap[e.feat])
    .flatMap((e) => e.modifiers.map((m) => ({ sourceId: featMap[e.feat], sourceType: "feats" as const, ...m })));

  if (modifiers.length > 0) {
    await db.insert(modifiersInCustomization).values(modifiers);
  }
}
