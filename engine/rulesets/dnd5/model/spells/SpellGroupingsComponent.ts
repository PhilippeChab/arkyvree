import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { SPELL_FIELDS } from "@/engine/rulesets/dnd5/entities/spells/fields.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd5/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd5/model/classes/ClassesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5/model/loading/DetailedCharacterDataLoader.ts";
import type { HeldSpell } from "@/engine/rulesets/dnd5/model/loading/loadedEntities.ts";
import SpellLists from "@/engine/rulesets/dnd5/rules/SpellLists.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd5/fields/index.ts";
import { SPELL_SAVE_DC_BASE } from "@/vocabulary/dnd5/spells.ts";

type SpellGroup = Record<string, SpellDcsByClass>;
type SpellGroupingsData = Record<string, SpellGroup>;

export interface SpellDc {
  readonly ability: number;
  base: number;
  misc: number;
  readonly proficiency: number;
  readonly total: number;
}

/**
 * A spell's DC is its casting class's: grouping key (normalized) → spell → class (its aptitude's slug) → shared SpellDc
 */
export type SpellDcsByClass = Record<string, SpellDc>;

/**
 * A character's spells' DCs: each spell's as each of its classes casts it, under the spell (`getDcs`, which the spells
 * component reads) and in its school's grouping.
 */
export default class SpellGroupingsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly classes: ClassesComponent,
  ) {
    super();
  }

  /** Each spell's DCs, by its slug, each class's (its aptitude's slug) in the order they were registered. */
  private readonly dcsBySpell: Record<string, SpellDcsByClass> = {};

  private readonly spellGroupings: SpellGroupingsData = {};

  /**
   * An empty grouping for every school of the ruleset's spells, so a modifier on a school the
   * character has no spells in resolves (zero matches, inactive) rather than failing its path (skipped); then each of
   * the character's spells' DC as its class casts it, keyed by the class's aptitude, as the spell's known flags are.
   */
  override initialize({ spells }: Pick<LoadedCharacterData, "spells">, { rulesetData }: RulesetView) {
    const groupingValues = new Set<string>();
    for (const { field, value } of rulesetData.kindValues("spells"))
      if (field === SPELL_SCHOOL) groupingValues.add(value);

    this.seedEmptyGroupings([...groupingValues]);

    const { spellSlugByAptitudeId } = SpellLists.of(rulesetData);
    for (const spell of spells) this.registerSpell(spell, spellSlugByAptitudeId.get(spell.viaId) ?? spell.viaId);
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
   * A spell's DC as one class casts it (`aptitudeSlug`, its list's), as the SRD 5.2.1 counts it: 8, the character's
   * Proficiency Bonus and that class's spellcasting ability's modifier, whatever the spell's level. The spell's other
   * classes keep theirs. Its school's grouping holds it, and so do its DCs (`getDcs`).
   */
  registerSpell(
    { abilityDcName, entity, spellLevel }: Pick<HeldSpell, "abilityDcName" | "entity" | "spellLevel">,
    aptitudeSlug: string,
  ): SpellDc | null {
    if (spellLevel == null || abilityDcName == null) return null;

    const { abilities, classes } = this;
    const abilityName = abilityDcName;

    // The casting ability's modifier, the Proficiency Bonus and the total are computed when read, so a raised ability
    // or a level raises the DC
    const dc: SpellDc = {
      base: SPELL_SAVE_DC_BASE,
      get ability() {
        return abilities.getAbilityModifier(abilityName);
      },
      misc: 0,
      get proficiency() {
        return classes.getProficiencyBonus();
      },
      get total() {
        return this.base + this.proficiency + this.ability + this.misc;
      },
    };

    const normalizedSpellName = stripSeparators(entity.name);
    // A spell is grouped under its school
    const { school } = SPELL_FIELDS.read(entity);
    const grouping = school === null ? "" : stripSeparators(school);
    if (grouping) ((this.spellGroupings[grouping] ??= {})[normalizedSpellName] ??= {})[aptitudeSlug] = dc;

    (this.dcsBySpell[normalizedSpellName] ??= {})[aptitudeSlug] = dc;
    return dc;
  }
}
