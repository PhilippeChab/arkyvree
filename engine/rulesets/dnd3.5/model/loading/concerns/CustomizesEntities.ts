import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { RACE_FIELDS } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedRace,
  CustomizedSpell,
  HeldFeat,
  HeldSpell,
} from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type { KlassLevel, Race } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The customizations a character's entities carry, from the view: their modifiers and requirements. */
export function CustomizesEntities<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class CustomizingEntities extends Base {
    /** Each spell with the ability its DC comes from: its class level's class's bonus spell ability. */
    private withDcAbilities(
      spells: Omit<CustomizedSpell, "abilityDcName">[],
      {
        klassBonusSpellAbilityMap,
        klassLevels,
      }: { klassBonusSpellAbilityMap: Map<string, string>; klassLevels: KlassLevel[] },
    ): CustomizedSpell[] {
      const klassIdByLevelId = new Map(klassLevels.map((level) => [level.id, level.klassId]));
      return spells.map((spell) => {
        const klassId = klassIdByLevelId.get(spell.klassLevelId);
        const abilityDcName = klassId === undefined ? undefined : klassBonusSpellAbilityMap.get(klassId);
        return { ...spell, abilityDcName: abilityDcName ?? null };
      });
    }

    /**
     * The feats the character's levels pick and its class levels grant, with their modifiers and requirements: the
     * compose step pre-merges siblings into these buckets. One a modifier gives too is `given` once its grant applies,
     * and one it doesn't hold is added then (`PossessesVirtually`).
     */
    protected toCustomizedFeats(allFeats: HeldFeat[], rulesetData: RulesetData): CustomizedFeat[] {
      return allFeats.map((feat) => ({
        ...feat,
        given: false,
        modifiers: rulesetData.modifiersBySource.get(feat.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(feat.id) ?? [],
      }));
    }

    /** Class levels' modifiers and requirements, and each level's bab and skill points. */
    protected toCustomizedKlassLevels(klassLevelsRaw: KlassLevel[], rulesetData: RulesetData) {
      const klassLevels: CustomizedClassLevel[] = klassLevelsRaw
        .map((level) => ({
          ...level,
          modifiers: rulesetData.modifiersBySource.get(level.id) ?? [],
          requirements: rulesetData.requirementsByEntity.get(level.id) ?? [],
        }))
        .sort((a, b) => a.level - b.level);

      const classLevelFields = new Map(
        klassLevels.map((level) => [level.id, CLASS_LEVEL_FIELDS.read(rulesetData.valuesOf(level.id))]),
      );
      return { klassLevels, classLevelFields };
    }

    /** The race with the fields its stored values hold (read once, here), its modifiers and requirements. */
    protected toCustomizedRace(race: Race, rulesetData: RulesetData): CustomizedRace {
      return {
        ...race,
        ...RACE_FIELDS.read(rulesetData.valuesOf(race.id)),
        modifiers: rulesetData.modifiersBySource.get(race.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(race.id) ?? [],
      };
    }

    /**
     * The spells the character's levels pick and its class levels grant, each in its pool, with their modifiers and
     * requirements (the compose step pre-merges siblings) and the ability their DC comes from. One a modifier makes
     * known on its list too is `given` there once its grant applies, and one its list doesn't know is added then
     * (`PossessesVirtually`).
     */
    protected toCustomizedSpells(
      allSpells: HeldSpell[],
      rulesetData: RulesetData,
      dcAbilities: { klassBonusSpellAbilityMap: Map<string, string>; klassLevels: KlassLevel[] },
    ): CustomizedSpell[] {
      const spells = allSpells.map((spell) => ({
        ...spell,
        given: false,
        modifiers: rulesetData.modifiersBySource.get(spell.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(spell.id) ?? [],
      }));
      return this.withDcAbilities(spells, dcAbilities);
    }
  }

  return CustomizingEntities;
}
