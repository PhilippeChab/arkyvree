import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { RACE_FIELDS } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedPower,
  CustomizedRace,
  HeldFeat,
  HeldPower,
} from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type { KlassLevel, Race } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The customizations a character's entities carry, from the view: their modifiers, properties and requirements. */
export function CustomizesEntities<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class CustomizingEntities extends Base {
    /** Each power with the ability its DC comes from: its class level's class's bonus spell ability. */
    private withDcAbilities(
      powers: Omit<CustomizedPower, "abilityDcName">[],
      {
        klassBonusSpellAbilityMap,
        klassLevels,
      }: { klassBonusSpellAbilityMap: Map<string, string>; klassLevels: KlassLevel[] },
    ): CustomizedPower[] {
      const klassIdByLevelId = new Map(klassLevels.map((level) => [level.id, level.klassId]));
      return powers.map((power) => {
        const klassId = klassIdByLevelId.get(power.klassLevelId);
        const abilityDcName = klassId === undefined ? undefined : klassBonusSpellAbilityMap.get(klassId);
        return { ...power, abilityDcName: abilityDcName ?? null };
      });
    }

    /**
     * The feats the character's levels pick and its class levels grant, with their properties, modifiers and
     * requirements: the compose step pre-merges siblings into these buckets. One a modifier gives too is `given` once
     * its grant applies, and one it doesn't hold is added then (`PossessesVirtually`).
     */
    protected toCustomizedFeats(allFeats: HeldFeat[], rulesetData: RulesetData): CustomizedFeat[] {
      return allFeats.map((feat) => ({
        ...feat,
        given: false,
        properties: rulesetData.propertiesByEntity.get(feat.id) ?? [],
        modifiers: rulesetData.modifiersBySource.get(feat.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(feat.id) ?? [],
      }));
    }

    /** Klass level properties/modifiers/requirements, and each level's bab and skill points. */
    protected toCustomizedKlassLevels(klassLevelsRaw: KlassLevel[], rulesetData: RulesetData) {
      const klassLevels: CustomizedClassLevel[] = klassLevelsRaw
        .map((level) => ({
          ...level,
          properties: rulesetData.propertiesByEntity.get(level.id) ?? [],
          modifiers: rulesetData.modifiersBySource.get(level.id) ?? [],
          requirements: rulesetData.requirementsByEntity.get(level.id) ?? [],
        }))
        .sort((a, b) => a.level - b.level);

      const klassLevelProperties = new Map(
        klassLevels.map((level) => [level.id, CLASS_LEVEL_FIELDS.read(level.properties)]),
      );
      return { klassLevels, klassLevelProperties };
    }

    /**
     * The powers the character's levels pick and its class levels grant, each in its pool, with their properties,
     * modifiers and requirements (the compose step pre-merges siblings) and the ability their DC comes from. One a
     * modifier makes known on its list too is `given` there once its grant applies, and one its list doesn't know is
     * added then (`PossessesVirtually`).
     */
    protected toCustomizedPowers(
      allPowers: HeldPower[],
      rulesetData: RulesetData,
      dcAbilities: { klassBonusSpellAbilityMap: Map<string, string>; klassLevels: KlassLevel[] },
    ): CustomizedPower[] {
      const powers = allPowers.map((power) => ({
        ...power,
        given: false,
        properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
        modifiers: rulesetData.modifiersBySource.get(power.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(power.id) ?? [],
      }));
      return this.withDcAbilities(powers, dcAbilities);
    }

    /** The race with the fields its properties hold (read once, here), its properties, modifiers and requirements. */
    protected toCustomizedRace(race: Race, rulesetData: RulesetData): CustomizedRace {
      const properties = rulesetData.propertiesByEntity.get(race.id) ?? [];
      return {
        ...race,
        ...RACE_FIELDS.read(properties),
        properties,
        modifiers: rulesetData.modifiersBySource.get(race.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(race.id) ?? [],
      };
    }
  }

  return CustomizingEntities;
}
