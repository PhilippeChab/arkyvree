import { formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import { type Aptitude, type Power, type PowerWithAptitudes, type Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

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

export default class PowersComponent {
  /** `propertyValues`: a property type's options in their order (the ruleset's), which a spell lists its values in. */
  constructor(private readonly propertyValues: (type: string) => readonly string[] | null) {}

  private readonly powers: PowersData = {};

  addPowerEntries(powers: (Power & { properties: Property[] })[]) {
    for (const power of powers) {
      const propertiesMap = groupPropertyValues(power.properties, this.propertyValues);

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
        result[key] = { ...entry, properties: formatPropertyValues(entry.properties, this.propertyValues) };
      }
    }
    return result;
  }

  getPower(name: string) {
    return this.powers[stripSeparators(name)] as PowerEntry | undefined;
  }

  getPowers() {
    return this.powers;
  }

  getSpellEntry(spellSlug: string, aptitudeSlug: string): { known: boolean } | undefined {
    const entry = this.powers[spellSlug] as Record<string, { known: boolean }> | undefined;
    return entry?.[aptitudeSlug];
  }

  /** `featListIds`: the lists a feat brings (a domain's, a specialist's school), whose spells it gives, never known. */
  initialize(
    powers: (Power & { aptitudeId: string; powerLevel: number | null; properties: Property[] })[],
    rulesetPowers: PowerWithAptitudes[],
    rulesetAptitudes: Aptitude[],
    featListIds: Set<string>,
  ) {
    this.addPowerEntries(powers);

    // Build spell known data nested under each spell entry: spell → aptitude → { known }, but on the lists a feat brings
    const aptitudeIdToSlug = new Map<string, string>();
    for (const apt of rulesetAptitudes) {
      if (featListIds.has(apt.id)) continue;
      aptitudeIdToSlug.set(apt.id, toSpellPossessionSlug(apt.name));
    }

    for (const power of rulesetPowers) {
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
  }

  /**
   * The groupings under `groups`: `powers.groups.<grouping>.*.dc.misc` reaches each spell of it, and each class's DC of
   * the spell through it (a spell is a group of its classes).
   */
  injectGroupings(groupings: Record<string, Record<string, PowerDcsByClass>>) {
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
  seedEmptyDcs(rulesetPowers: PowerWithAptitudes[]): void {
    for (const power of rulesetPowers) {
      if (!power.powersAptitudesInRules.some((pa) => pa.level != null)) continue;
      const entry: { dc?: PowerDcsByClass } = (this.powers[stripSeparators(power.name)] ??= {});
      entry.dc ??= {};
    }
  }
}
