import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import type DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import type { Property } from "@/shared/relations.ts";
import { capitalize, stripSeparators } from "@/shared/text.ts";

export type PowerDc = {
  base: number;
  level: number;
  readonly ability: number;
  misc: number;
  readonly total: number;
};

const NAVIGATABLE_POWER_DC_PATHS = [
  { path: "dc.misc", description: "Other bonuses to spell DC", type: "number" as const },
  { path: "dc.total", description: "Final DC for this spell", type: "number" as const, requirementOnly: true },
];

// Grouping key (normalized) → Record of power key → shared PowerDc reference
type PowerGroup = Record<string, PowerDc>;
type PowerGroupingsData = Record<string, PowerGroup>;

export default class DetailedCharacterPowerGroupings {
  constructor(
    private readonly detailedCharacterPowers: DetailedCharacterPowers,
    private readonly detailedCharacterAbilities: DetailedCharacterAbilities,
    private readonly groupingProperties: readonly string[],
  ) {}

  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_POWER_DC_PATHS, { dc: "DC", groups: "Groups" });
  }

  static generateTargetPaths(
    powerGroupings: string[],
    kind: "modifier" | "requirement",
    wildcard: boolean = true,
    groupLabel?: string,
  ): TargetPath[] {
    const paths: TargetPath[] = [];
    const wildcardSegment = wildcard ? ".*" : "";
    const namespace = wildcard ? "groups." : "";

    for (const grouping of powerGroupings) {
      for (const subPath of NAVIGATABLE_POWER_DC_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        const prefix = groupLabel ? `${capitalize(grouping)} ${groupLabel}` : capitalize(grouping);
        paths.push({
          path: `powers.${namespace}${grouping}${wildcardSegment}.${subPath.path}`,
          category: "powers",
          description: `${kind === "requirement" ? "Any" : "All"} ${prefix} — ${subPath.description}`,
          ...(groupLabel && { groupDescription: `${capitalize(grouping)} ${groupLabel} spells` }),
          valueType: subPath.type,
          operators: getNumericOperators(kind),
        });
      }
    }

    return paths;
  }

  private readonly powerGroupings: PowerGroupingsData = {};

  getPowerGroupings(): PowerGroupingsData {
    return this.powerGroupings;
  }

  registerPower(
    power: { name: string; powerLevel: number | null; abilityDcName: string | null },
    properties: Property[],
  ): PowerDc | null {
    if (power.powerLevel == null || power.abilityDcName == null) return null;

    const abilities = this.detailedCharacterAbilities;
    const abilityName = power.abilityDcName;

    // The casting ability's modifier and the total are computed when read, so a raised ability raises the DC
    const dc: PowerDc = {
      base: 10,
      level: power.powerLevel,
      get ability() {
        return abilities.getAbilityModifier(abilityName);
      },
      misc: 0,
      get total() {
        return this.base + this.level + this.ability + this.misc;
      },
    };

    const normalizedPowerName = stripSeparators(power.name);
    const groupingValues: string[] = [];

    for (const prop of properties) {
      if (this.groupingProperties.includes(prop.type)) {
        groupingValues.push(stripSeparators(prop.value));
      }
    }

    groupingValues.push(normalizedPowerName);

    for (const grouping of groupingValues) {
      if (!grouping) continue;
      if (!this.powerGroupings[grouping]) {
        this.powerGroupings[grouping] = {};
      }
      this.powerGroupings[grouping][normalizedPowerName] = dc;
    }

    // Attach dc to the power entry in DetailedCharacterPowers
    const powerEntry = this.detailedCharacterPowers.getPower(power.name);
    if (powerEntry) {
      powerEntry.dc = dc;
    }

    return dc;
  }

  /**
   * Pre-creates empty grouping buckets so wildcard target paths like
   * `powers.groups.<name>.*.dc.misc` resolve even when the character has no
   * spells of that grouping. Without this, the modifier evaluator reports
   * `Element not found` (skipped) rather than the more accurate "applied to
   * zero matches" (inactive).
   */
  seedEmptyGroupings(values: string[]): void {
    for (const raw of values) {
      const key = stripSeparators(raw);
      if (!key) continue;
      if (!this.powerGroupings[key]) {
        this.powerGroupings[key] = {};
      }
    }
  }
}
