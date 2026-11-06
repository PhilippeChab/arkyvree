/** A class's table, as its page shows it: each level's feat pools, spells per day and spells known, and its spell lists. */

import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import AptitudeTargets from "@/engine/rulesets/dnd5.2/model/aptitudes/AptitudeTargets.ts";
import SpellLists from "@/engine/rulesets/dnd5.2/rules/SpellLists.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Klass } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import type { Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import LevelTotals, { type TableModifier } from "./LevelTotals.ts";

/** The modifiers a class's levels set, each level's. */
function getLevelModifiers(rulesetData: RulesetData, levels: { id: string }[]) {
  return levels.flatMap((level) => rulesetData.modifiersBySource.get(level.id) ?? []);
}

/**
 * The spell lists a class's levels give slots in, by their aptitudes' ids: the one named for the class first, then the
 * others by level; none when they give none.
 */
function getSpellListIds(rulesetData: RulesetData, klass: Klass): string[] {
  const lists = [...(SpellLists.of(rulesetData).classListsByClass.get(klass.id) ?? [])];
  // A class casting from one of several lists (a pious templar's own, or its blackguard one) opens on its own
  const own = `${stripSeparators(klass.name)}spells`;
  const { aptitudeIdBySlug } = Dnd52View.of(rulesetData);
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
    return Dnd52View.of(this.view.rulesetData).classLevelsByClass.get(this.klass.id) ?? [];
  }

  /**
   * One of the class's tables, by its name (`feat-pools`, `spell-lists`, `spells`, `spells-known`): refused as not
   * found for a table it has none of. Its spell tables read its levels' modifiers as the view has them, or as a save
   * would leave them (`modifiers`: its progression's plan's).
   */
  describe(table: string, modifiers?: TableModifier[]) {
    if (table === "feat-pools") return this.describeFeatPools();
    if (table === "spell-lists") return this.describeSpellLists();
    if (table === "spells") return this.describeSpells(modifiers);
    if (table === "spells-known") return this.describeSpellsKnown(modifiers);
    throw new RulesError("not-found", `No ${table} table for classes`);
  }

  /**
   * The class's levels, each with the feats its pools hold by then (`featPools`, by pool name): what its own modifiers
   * add, and what the feats it grants add (a stackable one, "Bonus Feat (Fighter)", is a feat each level it's granted at
   * counts once).
   */
  describeFeatPools() {
    const { rulesetData } = this.view;
    const dnd52 = Dnd52View.of(rulesetData);
    const { levels } = this;
    const featModifiers: Modifier[] = levels.flatMap((level) =>
      dnd52
        .grantedFeatsOf(level.id)
        .flatMap((grant) =>
          (rulesetData.modifiersBySource.get(grant.toId) ?? [])
            .filter((modifier) => modifier.sourceType === "feats")
            .map((modifier) => ({ ...modifier, sourceId: grant.fromId })),
        ),
    );
    const nameBySlug = new Map(dnd52.aptitudes.map((aptitude) => [stripSeparators(aptitude.name), aptitude.name]));
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

  /**
   * The class's own spell list, named for it ("Witch Spells"): the aptitude of its name, as the view has it, whether or
   * not its levels give slots in it yet; its id none while the ruleset has no such aptitude, its name the one a first
   * add makes it under.
   */
  describeOwnList(): { id: string | null; name: string } {
    const name = `${this.klass.name} Spells`;
    const { aptitudeIdBySlug, aptitudesById } = Dnd52View.of(this.view.rulesetData);
    const aptitude = aptitudesById.get(aptitudeIdBySlug.get(stripSeparators(name)) ?? "");
    return aptitude ? { id: aptitude.id, name: aptitude.name } : { id: null, name };
  }

  /**
   * The spell lists the class's levels give slots in, its own first: what its spell tables add up, and what a character
   * of the class casts from. Never one they give none in.
   */
  describeSlotLists() {
    const { rulesetData } = this.view;
    const { aptitudesById } = Dnd52View.of(rulesetData);
    return getSpellListIds(rulesetData, this.klass).flatMap((listId) => {
      const list = aptitudesById.get(listId);
      return list ? [{ id: list.id, name: list.name }] : [];
    });
  }

  /**
   * What the class's spell list page offers: the lists its levels give slots in, its own first (`describeSlotLists`),
   * else its own list before they give slots in it (`describeOwnList`: "Witch Spells", where the ruleset has it and it
   * holds no feats, a feat pool being no list of spells; none else, the list a first add makes). Its characters read
   * the lists its levels give slots in alone.
   */
  describeSpellLists(): { id: string; name: string }[] {
    const lists = this.describeSlotLists();
    if (lists.length > 0) return lists;
    const own = this.describeOwnList();
    if (own.id === null || this.holdsFeats(own.id)) return [];
    return [{ id: own.id, name: own.name }];
  }

  /**
   * The class's levels, each with the spells per day it gives by spell level by then (`spellsPerDay`): from the level a
   * spell level opens at (its `allowed`, some spells or all of them, as the sheet's bonus spells read it), 0 until its
   * levels give it uses, as the Core Rulebook's tables write a spell level its bonus spells alone fill. Of its levels' modifiers
   * as the view has them, or as a save would leave them (`modifiers`: its progression's plan's).
   */
  describeSpells(modifiers: TableModifier[] = getLevelModifiers(this.view.rulesetData, this.levels)) {
    const { levels } = this;
    const totals = LevelTotals.computeRunning(levels, modifiers, LevelTotals.readPerDayStep);
    return levels.map((level) => ({ ...level, spellsPerDay: totals.get(level.id) ?? {} }));
  }

  /**
   * The class's levels, each with the spells it knows by spell level by then (`spellsKnown`; "All", every spell of its
   * list, once a level sets it). Of its levels' modifiers as the view has them, or as a save would leave them
   * (`modifiers`: its progression's plan's).
   */
  describeSpellsKnown(modifiers: TableModifier[] = getLevelModifiers(this.view.rulesetData, this.levels)) {
    const { levels } = this;
    const totals = LevelTotals.computeRunning(levels, modifiers, LevelTotals.readKnownStep);
    return levels.map((level) => ({ ...level, spellsKnown: totals.get(level.id) ?? {} }));
  }

  /** Whether an aptitude (`id`) holds feats: a feat pool, which a list of spells can't be. */
  holdsFeats(id: string) {
    const { rulesetData } = this.view;
    return Dnd52View.of(rulesetData).aptitudeIdsWithFeats.has(rulesetData.canonicalize(id));
  }
}
