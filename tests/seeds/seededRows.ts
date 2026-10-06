import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { Requirement } from "@/shared/relations.ts";

/** A requirement as its level and check, "2 classes.fighter.level greater_than_or_equal 4", or its level and chaining for a group, "1 or". */
export function describeRequirement(r: Requirement) {
  return r.target ? `${r.level} ${r.target} ${r.operator} ${r.value}` : `${r.level} ${r.chainingOperator}`;
}

/** The rows the seed wrote into a seeded ruleset, which it finds by name. */
export async function seededRows(rulesetName = DND35_RULESET_NAME) {
  const ruleset = await Rulesets.findOne(db, { name: rulesetName });
  if (!ruleset) throw new Error(`${rulesetName} isn't seeded`);
  const rows = await RulesetCache.getRawData(ruleset.id);
  const named = <T extends { name: string }>(list: T[], name: string) => {
    const row = list.find((r) => r.name === name);
    if (!row) throw new Error(`${name} isn't seeded in ${rulesetName}`);
    return row;
  };
  return {
    ...rows,
    rulesetId: ruleset.id,
    feat: (name: string) => named(rows.feats, name),
    aptitude: (name: string) => named(rows.aptitudes, name),
    klassLevel: (klass: string, level: number) =>
      rows.klassLevels.find((l) => l.klassId === named(rows.klasses, klass).id && l.level === level)!,
    modifiersOf: (sourceId: string) => rows.modifiers.filter((m) => m.sourceId === sourceId),
    requirementsOf: (entityId: string) => rows.requirements.filter((r) => r.entityId === entityId),
  };
}
