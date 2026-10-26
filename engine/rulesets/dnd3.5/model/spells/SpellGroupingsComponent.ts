import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { StoredValues } from "@/engine/core/fields/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { SPELL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/spells/fields.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { HeldSpell } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_DESCRIPTOR, SPELL_SCHOOL } from "@/vocabulary/dnd3.5/fields/index.ts";
import { SPELL_SAVE_DC_BASE } from "@/vocabulary/dnd3.5/spells.ts";

type SpellGroup = Record<string, SpellDcsByClass>;
type SpellGroupingsData = Record<string, SpellGroup>;

export interface SpellDc {
  readonly ability: number;
  base: number;
  level: number;
  misc: number;
  readonly total: number;
}

/**
 * A spell's DC is its casting class's: grouping key (normalized) → spell → class (its aptitude's slug) → shared SpellDc
 */
export type SpellDcsByClass = Record<string, SpellDc>;

/**
 * A character's spells' DCs: each spell's as each of its classes casts it, under the spell (`getDcs`, which the spells
 * component reads) and in its school's and descriptors' groupings.
 */
export default class SpellGroupingsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly abilities: AbilitiesComponent) {
    super();
  }

  /** Each spell's DCs, by its slug, each class's (its aptitude's slug) in the order they were registered. */
  private readonly dcsBySpell: Record<string, SpellDcsByClass> = {};

  private readonly spellGroupings: SpellGroupingsData = {};

  /**
   * An empty grouping for every school and descriptor of the ruleset's spells, so a Spell Focus on a school the
   * character has no spells in resolves (zero matches, inactive) rather than failing its path (skipped); then each of
   * the character's spells' DC as its class casts it, keyed by the class's aptitude, as the spell's known flags are.
   */
  override initialize({ spells }: Pick<LoadedCharacterData, "spells">, { rulesetData }: RulesetView) {
    const groupingValues = new Set<string>();
    for (const { field, value } of rulesetData.kindValues("spells"))
      if (field === SPELL_SCHOOL || field === SPELL_DESCRIPTOR) groupingValues.add(value);

    this.seedEmptyGroupings([...groupingValues]);

    const { spellSlugByAptitudeId } = SpellLists.of(rulesetData);
    for (const spell of spells) {
      this.registerSpell(
        spell,
        spellSlugByAptitudeId.get(spell.viaId) ?? spell.viaId,
        rulesetData.valuesOf(spell.entity.id),
      );
    }
  }

  /**
   * Pre-creates empty grouping buckets so wildcard target paths like
   * `spells.groups.<name>.*.dc.misc` resolve even when the character has no
   * spells of that grouping. Without this, the modifier evaluator reports
   * `Element not found` (skipped) rather than the more accurate "applied to
   * zero matches" (inactive).
   */
  private seedEmptyGroupings(values: string[]): void {
    for (const raw of values) {
      const key = stripSeparators(raw);
      if (!key) continue;
      if (!this.spellGroupings[key]) this.spellGroupings[key] = {};
    }
  }

  /** Each spell's DCs, by its slug, as each of its classes casts it: what the spells component holds on its spells. */
  getDcs(): Record<string, SpellDcsByClass> {
    return this.dcsBySpell;
  }

  getSpellGroupings(): SpellGroupingsData {
    return this.spellGroupings;
  }

  /**
   * A spell's DC as one class casts it (`aptitudeSlug`, its list's): its level on that class's list and that class's
   * casting ability, its school and descriptors read off its stored values (`values`). The spell's other classes keep
   * theirs. Its school and descriptor groupings hold it, and so do its DCs (`getDcs`).
   */
  registerSpell(
    { abilityDcName, entity, spellLevel }: Pick<HeldSpell, "abilityDcName" | "entity" | "spellLevel">,
    aptitudeSlug: string,
    values: StoredValues,
  ): SpellDc | null {
    if (spellLevel == null || abilityDcName == null) return null;

    const abilities = this.abilities;
    const abilityName = abilityDcName;

    // The casting ability's modifier and the total are computed when read, so a raised ability raises the DC
    const dc: SpellDc = {
      base: SPELL_SAVE_DC_BASE,
      level: spellLevel,
      get ability() {
        return abilities.getAbilityModifier(abilityName);
      },
      misc: 0,
      get total() {
        return this.base + this.level + this.ability + this.misc;
      },
    };

    const normalizedSpellName = stripSeparators(entity.name);
    // A spell is grouped under its school and each of its descriptors
    const { descriptors, school } = SPELL_FIELDS.read(values);
    for (const value of school === null ? descriptors : [school, ...descriptors]) {
      const grouping = stripSeparators(value);
      if (!grouping) continue;
      const group = (this.spellGroupings[grouping] ??= {});
      (group[normalizedSpellName] ??= {})[aptitudeSlug] = dc;
    }

    (this.dcsBySpell[normalizedSpellName] ??= {})[aptitudeSlug] = dc;
    return dc;
  }
}
