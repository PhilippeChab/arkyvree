/** A class's table, as its page shows it: each level's feat pools, spells per day and spells known, and its spell lists. */

import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import type { Klass, Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** What a level's modifier steps on its table: the key it counts toward, and that key's total after it. */
type TableStep<V> = { key: string | number; step: (total: V | undefined) => V };

/** The modifiers a class's levels set, each level's. */
function getLevelModifiers(rulesetData: RulesetData, levels: { id: string }[]) {
  return levels.flatMap((level) => rulesetData.modifiersBySource.get(level.id) ?? []);
}

/**
 * The spell lists a class's levels give slots in, by their aptitudes' ids: the one named for the class first, then the
 * others by level; none when they give none.
 */
function getSpellListIds(rulesetData: RulesetData, klass: Klass): string[] {
  const klassLevels = rulesetData.klassLevelsByKlass.get(klass.id) ?? [];
  const lists = [
    ...(SpellLists.collectClassLists({ klassLevels, modifiersBySource: rulesetData.modifiersBySource }).get(klass.id) ??
      []),
  ];
  // A class casting from one of several lists (a pious templar's own, or its blackguard one) opens on its own
  const own = `${stripSeparators(klass.name)}spells`;
  return [...lists.filter((list) => list === own), ...lists.filter((list) => list !== own)].flatMap(
    (list) => rulesetData.aptitudeIdBySlug.get(list) ?? [],
  );
}

/**
 * Each level's running totals by key, by its id: each of its modifiers (`modifiers`, by their `sourceId`, its level)
 * steps the total of the key it counts toward (`stepOf`; none counts toward no key), over the levels by their number.
 */
function runningTotals<V>(
  levels: { id: string; level: number }[],
  modifiers: { operator: string; sourceId: string; target: string; value: string }[],
  stepOf: (modifier: { operator: string; target: string; value: string }) => TableStep<V> | undefined,
): Map<string, Record<string | number, V>> {
  const stepsByLevelId = Map.groupBy(
    modifiers.flatMap((modifier) => {
      const step = stepOf(modifier);
      return step ? [{ ...step, levelId: modifier.sourceId }] : [];
    }),
    (step) => step.levelId,
  );
  const totals: Record<string | number, V> = {};
  const totalsByLevelId = new Map<string, Record<string | number, V>>();
  for (const level of levels.toSorted((a, b) => a.level - b.level)) {
    for (const { key, step } of stepsByLevelId.get(level.id) ?? []) totals[key] = step(totals[key]);
    totalsByLevelId.set(level.id, { ...totals });
  }
  return totalsByLevelId;
}

/**
 * A class's table (`klass`, as the view has it): its levels' feat pools, spells per day and spells known by then, and
 * its spell lists.
 */
export default class ClassTable {
  constructor(
    private readonly view: RulesetView,
    private readonly klass: Klass,
  ) {}

  /** The class's levels, as the view has them. */
  private get levels() {
    return this.view.rulesetData.klassLevelsByKlass.get(this.klass.id) ?? [];
  }

  /**
   * The class's levels, each with the feats its pools hold by then (`featPools`, by pool name): what its own modifiers
   * add, and what the feats it grants add (a stackable one, "Bonus Feat (Fighter)", is a feat each level it's granted at
   * counts once).
   */
  describeFeatPools() {
    const { rulesetData } = this.view;
    const { levels } = this;
    const featModifiers: Modifier[] = levels.flatMap((level) =>
      (rulesetData.klassLevelFeatsByKlassLevel.get(level.id) ?? []).flatMap((levelFeat) =>
        (rulesetData.modifiersBySource.get(levelFeat.featId) ?? [])
          .filter((modifier) => modifier.sourceType === "feats")
          .map((modifier) => ({ ...modifier, sourceId: levelFeat.klassLevelId })),
      ),
    );
    const nameBySlug = new Map(
      rulesetData.aptitudes.map((aptitude) => [stripSeparators(aptitude.name), aptitude.name]),
    );
    const totals = runningTotals<number>(
      levels,
      [...getLevelModifiers(rulesetData, levels), ...featModifiers],
      (modifier) => {
        const slug = AptitudeTargets.parsePool(modifier.target);
        const name = slug === undefined ? undefined : nameBySlug.get(slug);
        const value = LiteralValue.parse(modifier.value, "number");
        if (!name || typeof value !== "number") return undefined;
        return { key: name, step: (total) => (total ?? 0) + value };
      },
    );
    return levels.map((level) => ({ ...level, featPools: totals.get(level.id) ?? {} }));
  }

  /** The spell lists the class's levels give slots in, its own first: what its spell list page offers. */
  describeSpellLists() {
    const { rulesetData } = this.view;
    return getSpellListIds(rulesetData, this.klass).flatMap((listId) => {
      const list = rulesetData.aptitudesById.get(listId);
      return list ? [{ id: list.id, name: list.name }] : [];
    });
  }

  /** The class's levels, each with the spells per day it gives by spell level by then (`spellsPerDay`). */
  describeSpells() {
    const { levels } = this;
    const totals = runningTotals<number>(levels, getLevelModifiers(this.view.rulesetData, levels), (modifier) => {
      const target = AptitudeTargets.parseSpellLevel(modifier.target);
      const value = LiteralValue.parse(modifier.value, "number");
      if (target?.field !== "uses" || typeof value !== "number") return undefined;
      return { key: target.level, step: (total) => (total ?? 0) + value };
    });
    return levels.map((level) => ({ ...level, spellsPerDay: totals.get(level.id) ?? {} }));
  }

  /**
   * The class's levels, each with the spells it knows by spell level by then (`spellsKnown`; "All", every spell of its
   * list, once a level sets it).
   */
  describeSpellsKnown() {
    const { levels } = this;
    const totals = runningTotals<number | "All">(
      levels,
      getLevelModifiers(this.view.rulesetData, levels),
      (modifier) => {
        const target = AptitudeTargets.parseSpellLevel(modifier.target);
        const value = LiteralValue.parse(modifier.value, "number");
        if (target?.field !== "allowed" || typeof value !== "number") return undefined;
        const setsAll = modifier.operator === "set" && value === -1;
        return {
          key: target.level,
          step: (total) => (setsAll ? "All" : total === "All" ? "All" : (total ?? 0) + value),
        };
      },
    );
    return levels.map((level) => ({ ...level, spellsKnown: totals.get(level.id) ?? {} }));
  }
}
