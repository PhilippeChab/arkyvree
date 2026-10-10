import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { POWER_FIELDS } from "@/engine/rulesets/dnd3.5/entities/powers/fields.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import type { Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_DESCRIPTOR, SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";
import { SPELL_SAVE_DC_BASE } from "@/vocabulary/dnd3.5/spells.ts";

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

/**
 * A character's spells' DCs: each spell's as each of its classes casts it, under the spell (`getDcs`, which the powers
 * component reads) and in its school's and descriptors' groupings.
 */
export default class PowerGroupingsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly abilities: AbilitiesComponent) {
    super();
  }

  /** Each spell's DCs, by its slug, each class's (its aptitude's slug) in the order they were registered. */
  private readonly dcsByPower: Record<string, PowerDcsByClass> = {};

  private readonly powerGroupings: PowerGroupingsData = {};

  /**
   * An empty grouping for every school and descriptor of the ruleset's spells, so a Spell Focus on a school the
   * character has no spells in resolves (zero matches, inactive) rather than failing its path (skipped); then each of
   * the character's spells' DC as its class casts it, keyed by the class's aptitude, as the spell's known flags are.
   */
  override initialize({ powers }: Pick<LoadedCharacterData, "powers">, { rulesetData }: RulesetView) {
    const groupingValues = new Set<string>();
    for (const prop of rulesetData.propertiesByEntityType.get("powers") ?? [])
      if (prop.type === SPELL_SCHOOL || prop.type === SPELL_DESCRIPTOR) groupingValues.add(prop.value);

    this.seedEmptyGroupings([...groupingValues]);

    const { spellSlugByAptitudeId } = SpellLists.of(rulesetData);
    for (const power of powers) {
      const aptitudeSlug = spellSlugByAptitudeId.get(power.aptitudeId) ?? power.aptitudeId;
      this.registerPower({ ...power, aptitudeSlug }, power.properties);
    }
  }

  /**
   * Pre-creates empty grouping buckets so wildcard target paths like
   * `powers.groups.<name>.*.dc.misc` resolve even when the character has no
   * spells of that grouping. Without this, the modifier evaluator reports
   * `Element not found` (skipped) rather than the more accurate "applied to
   * zero matches" (inactive).
   */
  private seedEmptyGroupings(values: string[]): void {
    for (const raw of values) {
      const key = stripSeparators(raw);
      if (!key) continue;
      if (!this.powerGroupings[key]) this.powerGroupings[key] = {};
    }
  }

  /** Each spell's DCs, by its slug, as each of its classes casts it: what the powers component holds on its spells. */
  getDcs(): Record<string, PowerDcsByClass> {
    return this.dcsByPower;
  }

  getPowerGroupings(): PowerGroupingsData {
    return this.powerGroupings;
  }

  /**
   * A spell's DC as one class casts it (`aptitudeSlug`): its level on that class's list and that class's casting ability.
   * The spell's other classes keep theirs. Its school and descriptor groupings hold it, and so do its DCs (`getDcs`).
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
      base: SPELL_SAVE_DC_BASE,
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
    const { descriptors, school } = POWER_FIELDS.read(properties);
    for (const value of school === null ? descriptors : [school, ...descriptors]) {
      const grouping = stripSeparators(value);
      if (!grouping) continue;
      const group = (this.powerGroupings[grouping] ??= {});
      (group[normalizedPowerName] ??= {})[power.aptitudeSlug] = dc;
    }

    (this.dcsByPower[normalizedPowerName] ??= {})[power.aptitudeSlug] = dc;
    return dc;
  }
}
