import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { RACE_FIELDS } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type {
  CustomizedClassLevel,
  CustomizedRace,
  HeldFeat,
  HeldSource,
  HeldSpell,
} from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type { Feat, KlassLevel, Race, Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The customizations a character's entities carry, from the view: their modifiers and requirements. */
export function CustomizesEntities<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class CustomizingEntities extends Base {
    /** Each spell with the ability its DC comes from: its class level's class's bonus spell ability. */
    private withDcAbilities(
      spells: Omit<HeldSpell, "abilityDcName">[],
      {
        classBonusSpellAbilityMap,
        classLevels,
      }: { classBonusSpellAbilityMap: Map<string, string>; classLevels: KlassLevel[] },
    ): HeldSpell[] {
      const classIdByLevelId = new Map(classLevels.map((level) => [level.id, level.ownerId]));
      return spells.map((spell) => {
        const classId = spell.classLevelId === undefined ? undefined : classIdByLevelId.get(spell.classLevelId);
        const abilityDcName = classId === undefined ? undefined : classBonusSpellAbilityMap.get(classId);
        return { ...spell, abilityDcName: abilityDcName ?? null };
      });
    }

    /** Class levels' modifiers and requirements, and each level's bab and skill points. */
    protected toCustomizedClassLevels(classLevelsRaw: KlassLevel[], rulesetData: RulesetData) {
      const classLevels: CustomizedClassLevel[] = classLevelsRaw
        .map((level) => ({
          ...level,
          modifiers: rulesetData.modifiersBySource.get(level.id) ?? [],
          requirements: rulesetData.requirementsByEntity.get(level.id) ?? [],
        }))
        .sort((a, b) => a.position - b.position);

      const classLevelFields = new Map(classLevels.map((level) => [level.id, CLASS_LEVEL_FIELDS.read(level)]));
      return { classLevels, classLevelFields };
    }

    /** The race with its fields read (once, here), its modifiers and requirements. */
    protected toCustomizedRace(race: Race, rulesetData: RulesetData): CustomizedRace {
      return {
        ...race,
        ...RACE_FIELDS.read(race),
        modifiers: rulesetData.modifiersBySource.get(race.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(race.id) ?? [],
      };
    }

    /**
     * The feats the character's levels pick and its class levels grant, with their modifiers and requirements: the
     * compose step pre-merges siblings into these buckets. One a modifier gives too is `given` once its grant applies,
     * and one it doesn't hold is added then (`PossessesVirtually`).
     */
    protected toHeldFeats(feats: HeldSource<Feat>[], rulesetData: RulesetData): HeldFeat[] {
      return feats.map((feat) => ({
        ...feat,
        given: false,
        modifiers: rulesetData.modifiersBySource.get(feat.entity.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(feat.entity.id) ?? [],
        virtual: false,
      }));
    }

    /**
     * The spells the character's levels pick and its class levels grant, each in its pool, with their modifiers and
     * requirements (the compose step pre-merges siblings) and the ability their DC comes from. One a modifier makes
     * known on its list too is `given` there once its grant applies, and one its list doesn't know is added then
     * (`PossessesVirtually`).
     */
    protected toHeldSpells(
      spells: (HeldSource<Spell> & Pick<HeldSpell, "free" | "saveName" | "spellLevel" | "viaId">)[],
      rulesetData: RulesetData,
      dcAbilities: { classBonusSpellAbilityMap: Map<string, string>; classLevels: KlassLevel[] },
    ): HeldSpell[] {
      const customized = spells.map((spell) => ({
        ...spell,
        given: false,
        modifiers: rulesetData.modifiersBySource.get(spell.entity.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(spell.entity.id) ?? [],
        virtual: false,
      }));
      return this.withDcAbilities(customized, dcAbilities);
    }
  }

  return CustomizingEntities;
}
