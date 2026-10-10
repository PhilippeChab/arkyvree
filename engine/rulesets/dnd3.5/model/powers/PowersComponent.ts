import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35PropertyTypes from "@/engine/rulesets/dnd3.5/Dnd35PropertyTypes.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import { formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";
import { type Power, type PowerWithAptitudes, type Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import type PowerGroupingsComponent from "./PowerGroupingsComponent.ts";
import type { PowerDc, PowerDcsByClass } from "./PowerGroupingsComponent.ts";

type PowerEntry = {
  /** Its DC as each of the character's classes casts it, by the class's aptitude slug. */
  dc?: PowerDcsByClass;
  power: Power;
  /**
   * Each property type's values, in its options' order: a list, which a requirement's `contains` asks one of and a
   * modifier adds a value to or takes one from. A sheet lists them joined (`getFlatPowers`).
   */
  properties: Record<string, string[]>;
};

/** A grouping's spells, each with its DC as each class casts it */
type PowerGroupEntry = Record<string, Record<string, { dc: PowerDc }>>;
type PowerGroupsNamespace = Record<string, PowerGroupEntry>;

/**
 * Spell known entries ({ [aptSlug]: { known } }) are bolted onto PowerEntry objects and onto standalone entries for
 * spells the character doesn't have. The traversal system navigates these via dot paths (e.g.
 * powers.magicmissile.wizard.known). getSpellEntry() encapsulates all known reads.
 *
 * Groupings (school/descriptor) live under the reserved `groups` key (powers.groups.<name>.<spellSlug>.dc.misc) to
 * avoid collisions with spells whose name matches a school name (e.g. the Cleric spell "Divination" vs the Divination
 * school).
 */
type PowersData = {
  [key: string]: PowerEntry | PowerGroupEntry | Record<string, { known: boolean }> | PowerGroupsNamespace;
};

/**
 * A character's spells: each one's entry, with its properties' values, its known flag on each list it's on and its DC as
 * each class casts it, and its schools' and descriptors' groupings under `groups`, the power groupings' DCs.
 */
export default class PowersComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly powerGroupings: PowerGroupingsComponent) {
    super();
  }

  private readonly powers: PowersData = {};

  /**
   * The character's spells' entries; a known flag on each list the ruleset's spells are on, set for the character's
   * (the lists a feat brings, `SpellLists.featListIds`: a domain's, a specialist's school, give spells, never known);
   * then their DCs as the power groupings hold them, an empty DC for each leveled spell without one, and the groupings.
   */
  override initialize({ powers }: Pick<LoadedCharacterData, "powers">, { rulesetData }: RulesetView) {
    this.addPowerEntries(powers);

    // Build spell known data nested under each spell entry: spell → aptitude → { known }, but on the lists a feat brings
    const { featListIds, spellSlugByAptitudeId } = SpellLists.of(rulesetData);
    const aptitudeIdToSlug = new Map([...spellSlugByAptitudeId].filter(([aptitudeId]) => !featListIds.has(aptitudeId)));

    for (const power of rulesetData.powers) {
      const spellSlug = stripSeparators(power.name);
      for (const pa of power.powersAptitudesInRules) {
        if (pa.level == null) continue;
        const aptSlug = aptitudeIdToSlug.get(pa.aptitudeId);
        if (!aptSlug) continue;

        if (!this.powers[spellSlug]) this.powers[spellSlug] = {} as Record<string, { known: boolean }>;

        (this.powers[spellSlug] as Record<string, { known: boolean }>)[aptSlug] = { known: false };
      }
    }

    // Mark known from character's actual powers
    for (const power of powers) {
      const aptSlug = aptitudeIdToSlug.get(power.aptitudeId);
      if (!aptSlug) continue;

      const spellEntry = this.powers[stripSeparators(power.name)] as Record<string, { known: boolean }> | undefined;
      if (spellEntry?.[aptSlug]) spellEntry[aptSlug].known = true;
    }

    this.holdDcs();
    this.seedEmptyDcs(rulesetData.powers);
    this.holdGroupings();
  }

  /** Each spell's DC as each class casts it, as the power groupings hold them (`getDcs`), on the spell's entry. */
  private holdDcs(): void {
    for (const [slug, dcs] of Object.entries(this.powerGroupings.getDcs())) {
      const entry = this.powers[slug] as PowerEntry | undefined;
      if (!entry) continue;
      for (const [aptitudeSlug, dc] of Object.entries(dcs)) (entry.dc ??= {})[aptitudeSlug] = dc;
    }
  }

  /**
   * The power groupings under `groups`: `powers.groups.<grouping>.*.dc.misc` reaches each spell of it, and each class's
   * DC of the spell through it (a spell is a group of its classes).
   */
  private holdGroupings(): void {
    const groupings = this.powerGroupings.getPowerGroupings();
    if (Object.keys(groupings).length === 0) return;
    const namespace: PowerGroupsNamespace = {};
    for (const [key, group] of Object.entries(groupings)) {
      const wrapped: PowerGroupEntry = {};
      for (const [powerKey, dcs] of Object.entries(group))
        wrapped[powerKey] = Object.fromEntries(Object.entries(dcs).map(([klass, dc]) => [klass, { dc }]));

      namespace[key] = wrapped;
    }
    this.powers.groups = namespace;
  }

  /**
   * Every spell a list has at a level lists its DC paths (`powers.<spell>.dc.*.misc`): one the character doesn't cast
   * gets an empty DC there once the cast ones have theirs, so a modifier on it reaches nothing and a requirement on it is
   * unmet, as a school's empty group.
   */
  private seedEmptyDcs(rulesetPowers: PowerWithAptitudes[]): void {
    for (const power of rulesetPowers) {
      if (!power.powersAptitudesInRules.some((pa) => pa.level != null)) continue;
      const entry: { dc?: PowerDcsByClass } = (this.powers[stripSeparators(power.name)] ??= {});
      entry.dc ??= {};
    }
  }

  addPowerEntries(powers: (Power & { properties: Property[] })[]) {
    for (const power of powers) {
      const propertiesMap = groupPropertyValues(power.properties, Dnd35PropertyTypes.valuesOf);

      // A spell already listed keeps what's on its entry: its known flags and its DCs by class
      const slug = stripSeparators(power.name);
      this.powers[slug] = { ...this.powers[slug], power, properties: propertiesMap };
    }
  }

  /** The spells as a sheet lists them: each property type's values joined, those modifiers add included. */
  getFlatPowers(): Record<string, Omit<PowerEntry, "properties"> & { properties: Record<string, string> }> {
    const result: Record<string, Omit<PowerEntry, "properties"> & { properties: Record<string, string> }> = {};
    for (const [key, value] of Object.entries(this.powers)) {
      if ("power" in value) {
        const entry = value as PowerEntry;
        result[key] = { ...entry, properties: formatPropertyValues(entry.properties, Dnd35PropertyTypes.valuesOf) };
      }
    }
    return result;
  }

  getPower(name: string) {
    return this.powers[stripSeparators(name)] as PowerEntry | undefined;
  }

  getPowers(): PowersData {
    return this.powers;
  }

  /** A spell's known flag on a list (`listName`), by their names (or their slugs: a target's). */
  getSpellEntry(spellName: string, listName: string): { known: boolean } | undefined {
    const entry = this.powers[stripSeparators(spellName)] as Record<string, { known: boolean }> | undefined;
    return entry?.[SpellLists.toSpellPossessionSlug(listName)];
  }

  /**
   * The spells' DCs and groupings as the power groupings hold them again, once they've registered more: the spells the
   * spellcasting makes known (`KnownPowers`).
   */
  readGroupings(): void {
    this.holdDcs();
    this.holdGroupings();
  }
}
