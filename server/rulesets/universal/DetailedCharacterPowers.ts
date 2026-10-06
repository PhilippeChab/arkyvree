import type { PowerDc, PowerDcsByClass } from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import { formatPropertyType, formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import { type Aptitude, type Power, type PowerWithAptitudes, type Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * Spell known entries ({ [aptSlug]: { known } }) are bolted onto PowerEntry objects and onto standalone entries for
 * spells the character doesn't have. The traversal system navigates these via dot paths (e.g.
 * powers.magicmissile.wizard.known). getSpellEntry() encapsulates all known reads.
 *
 * Groupings (school/descriptor) live under the reserved `groups` key (powers.groups.<name>.<spellSlug>.dc.misc) to
 * avoid collisions with spells whose name matches a school name (e.g. the Cleric spell "Divination" vs the Divination
 * school).
 */
type DetailedCharacterComprehensivePowers = {
  [key: string]: PowerEntry | PowerGroupEntry | Record<string, { known: boolean }> | PowerGroupsNamespace;
};

type PowerEntry = {
  power: Power;
  /**
   * Each property type's values, in its options' order: a list, which a requirement's `contains` asks one of and a
   * modifier adds a value to or takes one from. A sheet lists them joined (`getFlatPowers`).
   */
  properties: Record<string, string[]>;
  /** Its DC as each of the character's classes casts it, by the class's aptitude slug. */
  dc?: PowerDcsByClass;
};
/** A grouping's spells, each with its DC as each class casts it */
type PowerGroupEntry = Record<string, Record<string, { dc: PowerDc }>>;

type PowerGroupsNamespace = Record<string, PowerGroupEntry>;

export default class DetailedCharacterPowers {
  /** `propertyValues`: a property type's options in their order (the ruleset's), which a spell lists its values in. */
  constructor(private readonly propertyValues: (type: string) => readonly string[] | null) {}

  static getSegmentLabels(): Record<string, string> {
    return { properties: "Properties", known: "Known" };
  }

  static generateTargetPaths(
    powers: (PowerWithAptitudes & { properties: Property[] })[],
    aptitudes: Aptitude[],
    featListIds: Set<string>,
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    // Property paths
    for (const power of powers) {
      const normalizedPowerName = stripSeparators(power.name);

      const propertyTypes = new Set(power.properties.map((p) => p.type));
      for (const type of propertyTypes) {
        paths.push({
          path: `powers.${normalizedPowerName}.properties.${type}`,
          category: "powers",
          description: `${power.name} ${formatPropertyType(type)} property`,
          valueType: "string",
          // A list of values: one of them is required or added, never the whole list as text
          operators: kind === "modifier" ? ["add", "subtract"] : ["contains", "not_contains"],
        });
      }
    }

    // Spell known paths, but on the lists a feat brings (a domain's, a specialist's school): their spells come with it
    const aptitudeIdToSlug = new Map<string, string>();
    for (const apt of aptitudes) {
      if (featListIds.has(apt.id)) continue;
      aptitudeIdToSlug.set(apt.id, toSpellPossessionSlug(apt.name));
    }

    const seen = new Set<string>();
    for (const power of powers) {
      const spellSlug = stripSeparators(power.name);
      for (const pa of power.powersAptitudesInRules) {
        if (pa.level == null) continue;
        const aptSlug = aptitudeIdToSlug.get(pa.aptitudeId);
        if (!aptSlug) continue;

        const path = `powers.${spellSlug}.${aptSlug}.known`;
        if (seen.has(path)) continue;
        seen.add(path);

        paths.push({
          path,
          category: "powers",
          description: `Whether ${power.name} is known`,
          valueType: "boolean",
          operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
        });
      }
    }

    return paths;
  }

  private readonly detailedCharacterPowers: DetailedCharacterComprehensivePowers = {};

  addPowerEntries(powers: (Power & { properties: Property[] })[]) {
    for (const power of powers) {
      const propertiesMap = groupPropertyValues(power.properties, this.propertyValues);

      // A spell already listed keeps what's on its entry: its known flags and its DCs by class
      const slug = stripSeparators(power.name);
      this.detailedCharacterPowers[slug] = { ...this.detailedCharacterPowers[slug], power, properties: propertiesMap };
    }
  }

  /** The spells as a sheet lists them: each property type's values joined, those modifiers add included. */
  getFlatPowers(): Record<string, Omit<PowerEntry, "properties"> & { properties: Record<string, string> }> {
    const result: Record<string, Omit<PowerEntry, "properties"> & { properties: Record<string, string> }> = {};
    for (const [key, value] of Object.entries(this.detailedCharacterPowers)) {
      if ("power" in value) {
        const entry = value as PowerEntry;
        result[key] = { ...entry, properties: formatPropertyValues(entry.properties, this.propertyValues) };
      }
    }
    return result;
  }

  getPower(name: string) {
    return this.detailedCharacterPowers[stripSeparators(name)] as PowerEntry | undefined;
  }

  getPowers() {
    return this.detailedCharacterPowers;
  }

  getSpellEntry(spellSlug: string, aptitudeSlug: string): { known: boolean } | undefined {
    const entry = this.detailedCharacterPowers[spellSlug] as Record<string, { known: boolean }> | undefined;
    return entry?.[aptitudeSlug];
  }

  /** `featListIds`: the lists a feat brings (a domain's, a specialist's school), whose spells it gives, never known. */
  initialize(
    powers: (Power & { properties: Property[]; aptitudeId: string; powerLevel: number | null })[],
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

        if (!this.detailedCharacterPowers[spellSlug]) {
          this.detailedCharacterPowers[spellSlug] = {} as Record<string, { known: boolean }>;
        }
        (this.detailedCharacterPowers[spellSlug] as Record<string, { known: boolean }>)[aptSlug] = { known: false };
      }
    }

    // Mark known from character's actual powers
    for (const power of powers) {
      const aptSlug = aptitudeIdToSlug.get(power.aptitudeId);
      if (!aptSlug) continue;

      const spellEntry = this.detailedCharacterPowers[stripSeparators(power.name)] as
        | Record<string, { known: boolean }>
        | undefined;
      if (spellEntry?.[aptSlug]) {
        spellEntry[aptSlug].known = true;
      }
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
      for (const [powerKey, dcs] of Object.entries(group)) {
        wrapped[powerKey] = Object.fromEntries(Object.entries(dcs).map(([klass, dc]) => [klass, { dc }]));
      }
      namespace[key] = wrapped;
    }
    this.detailedCharacterPowers.groups = namespace;
  }
}
