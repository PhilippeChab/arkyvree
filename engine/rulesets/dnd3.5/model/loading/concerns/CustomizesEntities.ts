import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { RACE_FIELDS } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import FeatsComponent from "@/engine/rulesets/dnd3.5/model/feats/FeatsComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedPower,
  CustomizedRace,
  HeldFeat,
  HeldPower,
} from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import PowersComponent from "@/engine/rulesets/dnd3.5/model/powers/PowersComponent.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { KlassLevel, Race } from "@/shared/relations.ts";

/** The customizations a character's entities carry, from the view: their modifiers, properties and requirements. */
export function CustomizesEntities<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class CustomizingEntities extends Base {
    /**
     * Each power with the ability its DC comes from: its class level's class's bonus spell ability; a spell granted
     * without a class level, its list's, as a spell of the same list its class casts gives it.
     */
    private withDcAbilities(
      powers: Omit<CustomizedPower, "abilityDcName">[],
      {
        klassBonusSpellAbilityMap,
        klassLevels,
      }: { klassBonusSpellAbilityMap: Map<string, string>; klassLevels: KlassLevel[] },
    ): CustomizedPower[] {
      const klassIdByLevelId = new Map(klassLevels.map((level) => [level.id, level.klassId]));
      const classAbilityOf = (power: { klassLevelId: string }) => {
        const klassId = klassIdByLevelId.get(power.klassLevelId);
        return klassId === undefined ? undefined : klassBonusSpellAbilityMap.get(klassId);
      };
      const abilityByAptitudeId = new Map<string, string>();
      for (const power of powers) {
        const abilityName = power.virtual ? undefined : classAbilityOf(power);
        if (abilityName) abilityByAptitudeId.set(power.aptitudeId, abilityName);
      }
      return powers.map((power) => ({
        ...power,
        abilityDcName: (power.virtual ? abilityByAptitudeId.get(power.aptitudeId) : classAbilityOf(power)) ?? null,
      }));
    }

    /**
     * Feat properties/modifiers/requirements. Compose step pre-merges siblings into these buckets; consumers only read.
     * Virtually possessed feats are appended with `virtual: true` so the rest of the pipeline sees one unified list —
     * eliminates the parallel "real vs virtual" code paths (registerFeat, possessed counts, modifier loading) that
     * historically missed cases like grouping DC bonuses on virtually-granted spells.
     */
    protected toCustomizedFeats(
      allFeats: HeldFeat[],
      virtuallyPossessedFeatIds: string[],
      rulesetData: RulesetData,
    ): CustomizedFeat[] {
      const realFeats: CustomizedFeat[] = allFeats.map((feat) => ({
        ...feat,
        properties: rulesetData.propertiesByEntity.get(feat.id) ?? [],
        modifiers: rulesetData.modifiersBySource.get(feat.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(feat.id) ?? [],
      }));
      const virtualFeats: CustomizedFeat[] = [];
      for (const featId of virtuallyPossessedFeatIds) {
        const featRow = rulesetData.featsById.get(featId);
        if (!featRow) continue;
        virtualFeats.push(FeatsComponent.toVirtualFeat(featRow, rulesetData));
      }
      return [...realFeats, ...virtualFeats];
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

    /** Power properties/modifiers/requirements. Compose step pre-merges siblings. */
    protected toCustomizedPowers(
      allPowers: HeldPower[],
      virtuallyPossessedPowers: { aptitudeId: string; powerId: string }[],
      rulesetData: RulesetData,
      dcAbilities: { klassBonusSpellAbilityMap: Map<string, string>; klassLevels: KlassLevel[] },
    ): CustomizedPower[] {
      const realPowers: Omit<CustomizedPower, "abilityDcName">[] = allPowers.map((power) => ({
        ...power,
        properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
        modifiers: rulesetData.modifiersBySource.get(power.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(power.id) ?? [],
      }));
      const virtualPowers: Omit<CustomizedPower, "abilityDcName">[] = [];
      for (const { powerId, aptitudeId } of virtuallyPossessedPowers) {
        const powerRow = rulesetData.powersById.get(powerId);
        if (!powerRow) continue;
        const link = powerRow.powersAptitudesInRules.find((pa) => pa.aptitudeId === aptitudeId);
        if (!link) continue;
        virtualPowers.push({
          ...powerRow,
          klassLevelId: "",
          characterLevelId: "",
          aptitudeId,
          virtual: true,
          free: true,
          saveName: PowersComponent.saveNameOf(powerRow, rulesetData),
          powerLevel: link.level,
          properties: rulesetData.propertiesByEntity.get(powerId) ?? [],
          modifiers: rulesetData.modifiersBySource.get(powerId) ?? [],
          requirements: rulesetData.requirementsByEntity.get(powerId) ?? [],
        });
      }
      return this.withDcAbilities([...realPowers, ...virtualPowers], dcAbilities);
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
