import { DND35_RULESET_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { Requirement } from "@/shared/relations.ts";
import { rawLists } from "@/tests/support/dnd3.5/rawLists.ts";

/** A requirement as its level and check, "2 classes.fighter.level greater_than_or_equal 4", or its level and chaining for a group, "1 or". */
export function describeRequirement(r: Requirement) {
  return r.target ? `${r.level} ${r.target} ${r.operator} ${r.value}` : `${r.level} ${r.chainingOperator}`;
}

/**
 * The rows the seed wrote into a seeded ruleset, which it finds by name: its feats and spells each with its lists
 * (`lists`, its `listedIn` links as the seed wrote them: each list's id, its name, and its level there).
 */
export async function seededRows(rulesetName = DND35_RULESET_NAME) {
  const ruleset = await Rulesets.findOne(db, { name: rulesetName });
  if (!ruleset) throw new Error(`${rulesetName} isn't seeded`);
  const raw = await RulesetViews.getRawData(ruleset.id);
  const view = await RulesetViews.getData(ruleset);
  const lists = (entity: { id: string }) =>
    (raw.links.get(entity.id)?.links ?? [])
      .filter((link) => link.role === "listedIn")
      .map((link) => ({
        aptitudeId: link.toId,
        level: link.tier,
        name: view.find("aptitudes", link.toId)?.name ?? "",
      }));
  const listed = rawLists(raw);
  const rows = {
    ...raw,
    ...listed,
    feats: listed.feats.map((feat) => ({ ...feat, lists: lists(feat) })),
    spells: listed.spells.map((spell) => ({ ...spell, lists: lists(spell) })),
  };
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
      rows.klassLevels.find((l) => l.ownerId === named(rows.klasses, klass).id && l.position === level)!,
    modifiersOf: (sourceId: string) => rows.modifiers.filter((m) => m.sourceId === sourceId),
    requirementsOf: (entityId: string) => rows.requirements.filter((r) => r.entityId === entityId),
    /** An entity's values of a field, as text (none without the field): the stored values the seed wrote. */
    textsOf: (entityId: string, field: string) => {
      const values = [...raw.values.values()].find((owners) => owners.has(entityId))?.get(entityId);
      return (values?.fields[field] ?? []).map(String);
    },
  };
}
