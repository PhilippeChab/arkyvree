import type { PowerDc } from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import { type Aptitude, type Power, type PowerWithAptitudes, type Property } from "@/shared/relations.ts";
import { formatPropertyType, spellPossessionSlug, stripSeparators } from "@/shared/utils.ts";

export type PowerEntry = {
  power: Power;
  properties: Record<string, string>;
  dc?: PowerDc;
};

type PowerGroupEntry = Record<string, { dc: PowerDc }>;
type PowerGroupsNamespace = Record<string, PowerGroupEntry>;

// Spell known entries ({ [aptSlug]: { known } }) are bolted onto PowerEntry objects
// and onto standalone entries for spells the character doesn't have. The traversal system
// navigates these via dot paths (e.g. powers.magicmissile.wizard.known).
// getSpellEntry() encapsulates all known reads.
//
// Groupings (school/descriptor) live under the reserved `groups` key
// (powers.groups.<name>.<spellSlug>.dc.misc) to avoid collisions with spells whose
// name matches a school name (e.g. the Cleric spell "Divination" vs the Divination school).
export type DetailedCharacterComprehensivePowers = {
  [key: string]: PowerEntry | PowerGroupEntry | Record<string, { known: boolean }> | PowerGroupsNamespace;
};

export default class DetailedCharacterPowers {
  static getSegmentLabels(): Record<string, string> {
    return { properties: "Properties", known: "Known" };
  }

  static generateTargetPaths(
    powers: (PowerWithAptitudes & { properties: Property[] })[],
    aptitudes: Aptitude[],
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
          operators: kind === "modifier"
            ? ["set"]
            : ["equal", "not_equal", "contains"],
        });
      }
    }

    // Spell known paths (exclude domain/specialist aptitudes — those are auto-granted)
    const aptitudeIdToSlug = new Map<string, string>();
    for (const apt of aptitudes) {
      if (apt.name.includes("Domain") || apt.name.includes("Specialist")) continue;
      aptitudeIdToSlug.set(apt.id, spellPossessionSlug(apt.name));
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
          operators: kind === "modifier"
            ? ["set"]
            : ["equal", "not_equal"],
        });
      }
    }

    return paths;
  }

  private readonly detailedCharacterPowers: DetailedCharacterComprehensivePowers = {};

  addPowerEntries(powers: (Power & { properties: Property[] })[]) {
    for (const power of powers) {
      const propertiesMap: Record<string, string> = {};
      for (const prop of power.properties) {
        if (prop.type in propertiesMap) {
          propertiesMap[prop.type] += `, ${prop.value}`;
        } else {
          propertiesMap[prop.type] = prop.value;
        }
      }

      this.detailedCharacterPowers[stripSeparators(power.name)] = {
        power,
        properties: propertiesMap,
      };
    }
  }

  initialize(
    powers: (Power & { properties: Property[]; aptitudeId: string; powerLevel: number | null })[],
    rulesetPowers: PowerWithAptitudes[],
    rulesetAptitudes: Aptitude[],
  ) {
    this.addPowerEntries(powers);

    // Build spell known data nested under each spell entry: spell → aptitude → { known }
    // Exclude domain/specialist aptitudes — those are auto-granted, not "known"
    const aptitudeIdToSlug = new Map<string, string>();
    for (const apt of rulesetAptitudes) {
      if (apt.name.includes("Domain") || apt.name.includes("Specialist")) continue;
      aptitudeIdToSlug.set(apt.id, spellPossessionSlug(apt.name));
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

      const spellEntry = this.detailedCharacterPowers[stripSeparators(power.name)] as Record<string, { known: boolean }> | undefined;
      if (spellEntry?.[aptSlug]) {
        spellEntry[aptSlug].known = true;
      }
    }
  }

  injectGroupings(groupings: Record<string, Record<string, PowerDc>>) {
    if (Object.keys(groupings).length === 0) return;
    const namespace: PowerGroupsNamespace = {};
    for (const [key, group] of Object.entries(groupings)) {
      const wrapped: PowerGroupEntry = {};
      for (const [powerKey, dc] of Object.entries(group)) {
        wrapped[powerKey] = { dc };
      }
      namespace[key] = wrapped;
    }
    this.detailedCharacterPowers.groups = namespace;
  }

  getPowers() {
    return this.detailedCharacterPowers;
  }

  getFlatPowers(): Record<string, PowerEntry> {
    const result: Record<string, PowerEntry> = {};
    for (const [key, value] of Object.entries(this.detailedCharacterPowers)) {
      if ("power" in value) {
        result[key] = value as PowerEntry;
      }
    }
    return result;
  }

  getPower(name: string) {
    return this.detailedCharacterPowers[stripSeparators(name)] as PowerEntry | undefined;
  }

  getSpellEntry(spellSlug: string, aptitudeSlug: string): { known: boolean } | undefined {
    const entry = this.detailedCharacterPowers[spellSlug] as Record<string, { known: boolean }> | undefined;
    return entry?.[aptitudeSlug];
  }

  updateTotals(): void {
    for (const value of Object.values(this.detailedCharacterPowers)) {
      if ("dc" in value) {
        const dc = (value as PowerEntry).dc!;
        dc.total = dc.base + dc.level + dc.ability + dc.misc;
      }
    }
  }
}
