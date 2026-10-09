import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import type { Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import PowerFields from "./PowerFields.ts";
import type PowersComponent from "./PowersComponent.ts";

type PowerGroup = Record<string, PowerDcsByClass>;
type PowerGroupingsData = Record<string, PowerGroup>;

export type PowerDc = {
  readonly ability: number;
  base: number;
  level: number;
  misc: number;
  readonly total: number;
};

/**
 * A spell's DC is its casting class's: grouping key (normalized) → spell → class (its aptitude's slug) → shared PowerDc
 */
export type PowerDcsByClass = Record<string, PowerDc>;

export default class PowerGroupingsComponent {
  constructor(
    private readonly powers: PowersComponent,
    private readonly abilities: AbilitiesComponent,
  ) {}

  private readonly powerGroupings: PowerGroupingsData = {};

  getPowerGroupings(): PowerGroupingsData {
    return this.powerGroupings;
  }

  /**
   * A spell's DC as one class casts it (`aptitudeSlug`): its level on that class's list and that class's casting ability.
   * The spell's other classes keep theirs. Its school and descriptor groupings and its entry hold it.
   */
  registerPower(
    power: { abilityDcName: string | null; aptitudeSlug: string; name: string; powerLevel: number | null },
    properties: Property[],
  ): PowerDc | null {
    if (power.powerLevel == null || power.abilityDcName == null) return null;

    const abilities = this.abilities;
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
    // A spell is grouped under its school and each of its descriptors
    const { descriptors = [], school } = PowerFields.read(properties);
    for (const value of school === undefined ? descriptors : [school, ...descriptors]) {
      const grouping = stripSeparators(value);
      if (!grouping) continue;
      const group = (this.powerGroupings[grouping] ??= {});
      (group[normalizedPowerName] ??= {})[power.aptitudeSlug] = dc;
    }

    const powerEntry = this.powers.getPower(power.name);
    if (powerEntry) (powerEntry.dc ??= {})[power.aptitudeSlug] = dc;

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
      if (!this.powerGroupings[key]) this.powerGroupings[key] = {};
    }
  }
}
