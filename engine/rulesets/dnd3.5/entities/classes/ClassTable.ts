/** A class's table, as its page shows it: each level's feat pools, spells per day and spells known, and its spell lists. */

import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import LevelTotals from "./LevelTotals.ts";

/** The modifiers a class's levels set, each level's. */
function getLevelModifiers(rulesetData: RulesetData, levels: { id: string }[]) {
  return levels.flatMap((level) => rulesetData.modifiersBySource.get(level.id) ?? []);
}

/**
 * The spell lists a class's levels give slots in, by their aptitudes' ids: the one named for the class first, then the
 * others by level; none when they give none.
 */
function getSpellListIds(rulesetData: RulesetData, klass: Klass): string[] {
  const lists = [...(SpellLists.of(rulesetData).classListsByKlass.get(klass.id) ?? [])];
  // A class casting from one of several lists (a pious templar's own, or its blackguard one) opens on its own
  const own = `${stripSeparators(klass.name)}spells`;
  const { aptitudeIdBySlug } = Dnd35View.of(rulesetData);
  return [...lists.filter((list) => list === own), ...lists.filter((list) => list !== own)].flatMap(
    (list) => aptitudeIdBySlug.get(list) ?? [],
  );
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
    return Dnd35View.of(this.view.rulesetData).klassLevelsByKlass.get(this.klass.id) ?? [];
  }

  /**
   * One of the class's tables, by its name (`feat-pools`, `spell-lists`, `spells`, `spells-known`): refused as not
   * found for a table it has none of.
   */
  describe(table: string) {
    if (table === "feat-pools") return this.describeFeatPools();
    if (table === "spell-lists") return this.describeSpellLists();
    if (table === "spells") return this.describeSpells();
    if (table === "spells-known") return this.describeSpellsKnown();
    throw new RulesError("not-found", `No ${table} table for classes`);
  }

  /**
   * The class's levels, each with the feats its pools hold by then (`featPools`, by pool name): what its own modifiers
   * add, and what the feats it grants add (a stackable one, "Bonus Feat (Fighter)", is a feat each level it's granted at
   * counts once).
   */
  describeFeatPools() {
    const { rulesetData } = this.view;
    const dnd35 = Dnd35View.of(rulesetData);
    const { levels } = this;
    const featModifiers: Modifier[] = levels.flatMap((level) =>
      dnd35
        .grantedFeatsOf(level.id)
        .flatMap((grant) =>
          (rulesetData.modifiersBySource.get(grant.toId) ?? [])
            .filter((modifier) => modifier.sourceType === "feats")
            .map((modifier) => ({ ...modifier, sourceId: grant.fromId })),
        ),
    );
    const nameBySlug = new Map(dnd35.aptitudes.map((aptitude) => [stripSeparators(aptitude.name), aptitude.name]));
    const totals = LevelTotals.computeRunning<number>(
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
    const { aptitudesById } = Dnd35View.of(rulesetData);
    return getSpellListIds(rulesetData, this.klass).flatMap((listId) => {
      const list = aptitudesById.get(listId);
      return list ? [{ id: list.id, name: list.name }] : [];
    });
  }

  /**
   * The class's levels, each with the spells per day it gives by spell level by then (`spellsPerDay`): from the level a
   * spell level opens at (its `allowed`, some spells or all of them, as the sheet's bonus spells read it), 0 until its
   * levels give it uses, as the SRD's tables write a spell level its bonus spells alone fill.
   */
  describeSpells() {
    const { levels } = this;
    const totals = LevelTotals.computeRunning(
      levels,
      getLevelModifiers(this.view.rulesetData, levels),
      LevelTotals.readPerDayStep,
    );
    return levels.map((level) => ({ ...level, spellsPerDay: totals.get(level.id) ?? {} }));
  }

  /**
   * The class's levels, each with the spells it knows by spell level by then (`spellsKnown`; "All", every spell of its
   * list, once a level sets it).
   */
  describeSpellsKnown() {
    const { levels } = this;
    const totals = LevelTotals.computeRunning(
      levels,
      getLevelModifiers(this.view.rulesetData, levels),
      LevelTotals.readKnownStep,
    );
    return levels.map((level) => ({ ...level, spellsKnown: totals.get(level.id) ?? {} }));
  }
}
