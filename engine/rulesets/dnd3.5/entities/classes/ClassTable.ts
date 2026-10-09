/** A class's table, as its page shows it: each level's feat pools, spells per day and spells known, and its spell lists. */

import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import { type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import type { Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import ClassEntity from "./ClassEntity.ts";

/** Each level, with what its pools hold by then: the modifiers' pool counts, summed over it and the levels below. */
function addFeatPools<T extends { id: string; level: number }>(
  levels: T[],
  modifiers: { operator: string; sourceId: string; target: string; value: string }[],
  aptitudes: { name: string }[],
): (T & { featPools: Record<string, number> })[] {
  // Build slug → display name map from aptitudes
  const slugToName = new Map<string, string>();
  for (const apt of aptitudes) slugToName.set(stripSeparators(apt.name), apt.name);

  // Build levelId → { [aptitudeName]: delta } map
  const deltasByLevelId = new Map<string, Record<string, number>>();
  for (const mod of modifiers) {
    const slug = AptitudeTargets.parsePool(mod.target);
    if (slug === undefined) continue;
    const name = slugToName.get(slug);
    const value = LiteralValue.parse(mod.value, "number");
    if (!name || typeof value !== "number") continue;
    let entry = deltasByLevelId.get(mod.sourceId);
    if (!entry) {
      entry = {};
      deltasByLevelId.set(mod.sourceId, entry);
    }
    entry[name] = (entry[name] ?? 0) + value;
  }

  // Sort levels ascending by level number
  const sorted = [...levels].sort((a, b) => a.level - b.level);

  // Walk levels in order, keeping cumulative totals
  const cumulative: Record<string, number> = {};
  const resultMap = new Map<string, Record<string, number>>();
  for (const level of sorted) {
    const deltas = deltasByLevelId.get(level.id);
    if (deltas) for (const [name, delta] of Object.entries(deltas)) cumulative[name] = (cumulative[name] ?? 0) + delta;

    resultMap.set(level.id, { ...cumulative });
  }

  return levels.map((level) => ({
    ...level,
    featPools: resultMap.get(level.id) ?? {},
  }));
}

/** Each level, with the spells it knows by spell level by then, summed over it and the levels below: "All" once one sets it. */
function addSpellsKnown<T extends { id: string; level: number }>(
  levels: T[],
  modifiers: { operator: string; sourceId: string; target: string; value: string }[],
): (T & { spellsKnown: Record<number, number | "All"> })[] {
  // Build a map of levelId → { [spellLevel]: { delta, operator } }[]
  const deltasByLevelId = new Map<string, { delta: number; operator: string; spellLevel: number }[]>();
  for (const mod of modifiers) {
    const target = AptitudeTargets.parseSpellLevel(mod.target);
    const value = LiteralValue.parse(mod.value, "number");
    if (target?.field !== "allowed" || typeof value !== "number") continue;
    const spellLevel = target.level;
    let entry = deltasByLevelId.get(mod.sourceId);
    if (!entry) {
      entry = [];
      deltasByLevelId.set(mod.sourceId, entry);
    }
    entry.push({ spellLevel, delta: value, operator: mod.operator });
  }

  // Sort levels ascending by level number
  const sorted = [...levels].sort((a, b) => a.level - b.level);

  // Walk levels in order, keeping cumulative totals
  const cumulative: Record<number, number | "All"> = {};
  const resultMap = new Map<string, Record<number, number | "All">>();
  for (const level of sorted) {
    const deltas = deltasByLevelId.get(level.id);
    if (deltas) {
      for (const { spellLevel, delta, operator } of deltas) {
        if (operator === "set" && delta === -1) cumulative[spellLevel] = "All";
        else if (cumulative[spellLevel] !== "All")
          cumulative[spellLevel] = ((cumulative[spellLevel] as number) ?? 0) + delta;
      }
    }
    resultMap.set(level.id, { ...cumulative });
  }

  return levels.map((level) => ({
    ...level,
    spellsKnown: resultMap.get(level.id) ?? {},
  }));
}

/** Each level, with its spells per day by spell level by then, summed over it and the levels below. */
function addSpellsPerDay<T extends { id: string; level: number }>(
  levels: T[],
  modifiers: { operator: string; sourceId: string; target: string; value: string }[],
): (T & { spellsPerDay: Record<number, number> })[] {
  // Build a map of levelId → { [spellLevel]: delta }
  const deltasByLevelId = new Map<string, Record<number, number>>();
  for (const mod of modifiers) {
    const target = AptitudeTargets.parseSpellLevel(mod.target);
    const value = LiteralValue.parse(mod.value, "number");
    if (target?.field !== "uses" || typeof value !== "number") continue;
    const spellLevel = target.level;
    let entry = deltasByLevelId.get(mod.sourceId);
    if (!entry) {
      entry = {};
      deltasByLevelId.set(mod.sourceId, entry);
    }
    entry[spellLevel] = (entry[spellLevel] ?? 0) + value;
  }

  // Sort levels ascending by level number
  const sorted = [...levels].sort((a, b) => a.level - b.level);

  // Walk levels in order, keeping cumulative totals
  const cumulative: Record<number, number> = {};
  const resultMap = new Map<string, Record<number, number>>();
  for (const level of sorted) {
    const deltas = deltasByLevelId.get(level.id);
    if (deltas)
      for (const [sl, delta] of Object.entries(deltas)) cumulative[Number(sl)] = (cumulative[Number(sl)] ?? 0) + delta;

    resultMap.set(level.id, { ...cumulative });
  }

  return levels.map((level) => ({
    ...level,
    spellsPerDay: resultMap.get(level.id) ?? {},
  }));
}

/** The modifiers a class's levels set, each level's. */
function getLevelModifiers(rulesetData: RulesetData, levels: { id: string }[]) {
  return levels.flatMap((level) => rulesetData.modifiersBySource.get(level.id) ?? []);
}

/**
 * The spell lists a class's levels give slots in, by their aptitudes' ids: the one named for the class first, then the
 * others by level; none when they give none.
 */
function getSpellListIds(
  rulesetData: Pick<RulesetData, "klassesById" | "klassLevelsByKlassId" | "modifiersBySource" | "aptitudeIdBySlug">,
  klassId: string,
): string[] {
  const klassLevels = rulesetData.klassLevelsByKlassId.get(klassId) ?? [];
  const lists = [
    ...(SpellLists.collectClassLists({ klassLevels, modifiersBySource: rulesetData.modifiersBySource }).get(klassId) ??
      []),
  ];
  // A class casting from one of several lists (a pious templar's own, or its blackguard one) opens on its own
  const own = `${stripSeparators(rulesetData.klassesById.get(klassId)?.name ?? "")}spells`;
  return [...lists.filter((list) => list === own), ...lists.filter((list) => list !== own)].flatMap(
    (list) => rulesetData.aptitudeIdBySlug.get(list) ?? [],
  );
}

/** A class's table: its feat pools, its spell lists, and its spells per day and known by level. */
export default class ClassTable {
  constructor(private readonly view: RulesetView) {}

  /**
   * A class's levels, each with the feats its pools hold by then: what its own modifiers add, and what the feats it
   * grants add (a stackable one, "Bonus Feat (Fighter)", is a feat each level it's granted at counts once).
   */
  describeFeatPools(classId: string) {
    const klassId = new ClassEntity(this.view).find(classId).id;
    const { rulesetData } = this.view;
    const levels = rulesetData.klassLevelsByKlassId.get(klassId) ?? [];
    const featModifiers: Modifier[] = levels.flatMap((level) =>
      (rulesetData.klassLevelFeatsByKlassLevel.get(level.id) ?? []).flatMap((levelFeat) =>
        (rulesetData.modifiersBySource.get(levelFeat.featId) ?? [])
          .filter((modifier) => modifier.sourceType === "feats")
          .map((modifier) => ({ ...modifier, sourceId: levelFeat.klassLevelId })),
      ),
    );
    return addFeatPools(levels, [...getLevelModifiers(rulesetData, levels), ...featModifiers], rulesetData.aptitudes);
  }

  /** The spell lists a class's levels give slots in, its own first: what its spell list page offers. */
  describeSpellLists(classId: string) {
    const klassId = new ClassEntity(this.view).find(classId).id;
    const { rulesetData } = this.view;
    return getSpellListIds(rulesetData, klassId).flatMap((listId) => {
      const list = rulesetData.aptitudesById.get(listId);
      return list ? [{ id: list.id, name: list.name }] : [];
    });
  }

  /** A class's levels, each with the spells per day it gives by spell level by then. */
  describeSpells(classId: string) {
    const klassId = new ClassEntity(this.view).find(classId).id;
    const levels = this.view.rulesetData.klassLevelsByKlassId.get(klassId) ?? [];
    return addSpellsPerDay(levels, getLevelModifiers(this.view.rulesetData, levels));
  }

  /** A class's levels, each with the spells it knows by spell level by then ("All": every spell of its list). */
  describeSpellsKnown(classId: string) {
    const klassId = new ClassEntity(this.view).find(classId).id;
    const levels = this.view.rulesetData.klassLevelsByKlassId.get(klassId) ?? [];
    return addSpellsKnown(levels, getLevelModifiers(this.view.rulesetData, levels));
  }
}
