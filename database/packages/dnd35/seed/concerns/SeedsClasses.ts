import type { ClassSeed } from "@/database/packages/dnd35/content/types.ts";
import { BAB, CASTER_LEVEL_APTITUDES, SAVE, spellSlots } from "@/database/packages/dnd35/seed/classTables.ts";
import { idOf } from "@/database/packages/dnd35/seed/context.ts";
import { requirementRows } from "@/database/packages/dnd35/seed/customizationRows.ts";
import type { SeederState } from "@/database/packages/dnd35/seed/SeederState.ts";
import {
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelSavesInRules,
  klassLevelsInRules,
  klassSkillsInRules,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";
import {
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  KLASS_LEVEL_BAB,
  KLASS_LEVEL_SKILL_POINTS,
} from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A class's levels, as seeded: each level's id and number. */
type Levels = { id: string; level: number }[];

/** Seeding classes. */
export function SeedsClasses<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingClasses extends Base {
    /** The feats its levels grant: its class features, its proficiencies and its free feats. */
    private async insertGrantedFeats(def: ClassSeed, levelIds: Record<number, string>) {
      const granted = (level: number, feat: string, aptitude: string, what: string) => ({
        klassLevelId: levelIds[level],
        featId: idOf(this.ctx.featMap, feat, `${def.name}'s ${what}`),
        aptitudeId: idOf(this.ctx.aptMap, aptitude, `${def.name}'s ${what}`),
        free: true,
      });
      const featureAptitude = def.classFeatureAptitude;
      await this.insertAll(klassLevelFeatsInRules, [
        ...(featureAptitude
          ? (def.classFeatures ?? []).map(([level, feat]) =>
              granted(level, feat, featureAptitude, `class feature at level ${level}`),
            )
          : []),
        ...(def.proficiencies ?? []).map((feat) => granted(1, feat, "General", "proficiency")),
        ...(def.freeFeats ?? []).map(([level, feat, aptitude]) =>
          granted(level, feat, aptitude, `free feat at level ${level}`),
        ),
      ]);
    }

    /** Its levels' modifiers: spell slots, the class's own, and one more pick in an aptitude. */
    private async insertLevelModifiers(def: ClassSeed, levels: Levels) {
      const levelModifiers = [...(def.spells ? spellSlots(def.spells) : []), ...(def.modifiers ?? [])];
      const advancement = def.casterLevelAdvancement;
      const picks = [
        ...(def.aptitudePicks ?? []),
        ...(advancement
          ? CASTER_LEVEL_APTITUDES[advancement.type].map((aptitude) => ({
              levels: advancement.levels,
              target: `aptitudes.${stripSeparators(aptitude)}.allowed`,
            }))
          : []),
      ];
      await this.insertModifiers(
        "klass_levels",
        levels.flatMap(({ id, level }) =>
          [
            ...levelModifiers.filter((m) => m.level === level),
            ...picks
              .filter((pick) => pick.levels.includes(level))
              .map((pick) => ({ target: pick.target, value: "1", valueType: "number", operator: "add" })),
          ].map((modifier) => ({ sourceId: id, modifier })),
        ),
      );
    }

    /** Each level after the first takes the one before; the first, the class's requirements. */
    private async insertLevelRequirements(def: ClassSeed, levels: Levels, levelIds: Record<number, string>) {
      const classSlug = stripSeparators(def.name);
      await this.insertAll(requirementsInCustomization, [
        ...levels
          .filter(({ level }) => level >= 2)
          .map(({ id, level }) => ({
            entityId: id,
            entityType: "klass_levels",
            level: "1",
            target: `classes.${classSlug}.level`,
            value: String(level - 1),
            valueType: "number",
            operator: "greater_than",
          })),
        ...requirementRows(levelIds[1], "klass_levels", def.requirements),
      ]);
    }

    /** Its properties and its levels': its bonus spell ability and caster type, each level's base attack and points. */
    private async insertProperties(def: ClassSeed, klassId: string, levels: Levels) {
      const bonusSpellAbilityId = def.bonusSpellAbility && this.ctx.abilityMap[def.bonusSpellAbility];
      await this.insertAll(propertiesInCustomization, [
        ...(bonusSpellAbilityId
          ? [
              {
                entityId: klassId,
                entityType: "klasses",
                type: KLASS_BONUS_SPELL_ABILITY_ID,
                value: bonusSpellAbilityId,
              },
            ]
          : []),
        ...(def.casterType
          ? [{ entityId: klassId, entityType: "klasses", type: KLASS_CASTER_TYPE, value: def.casterType }]
          : []),
        ...levels.flatMap(({ id, level }) => [
          { entityId: id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: String(BAB[def.bab](level)) },
          { entityId: id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: String(def.skillPoints) },
        ]),
      ]);
    }

    /** Each level's base saves. */
    private async insertSaves(def: ClassSeed, levels: Levels) {
      await this.insertAll(
        klassLevelSavesInRules,
        levels.flatMap(({ id, level }) => [
          { klassLevelId: id, saveId: this.ctx.saveMap["Fortitude"], base: SAVE[def.saves.fortitude](level) },
          { klassLevelId: id, saveId: this.ctx.saveMap["Reflex"], base: SAVE[def.saves.reflex](level) },
          { klassLevelId: id, saveId: this.ctx.saveMap["Will"], base: SAVE[def.saves.will](level) },
        ]),
      );
    }

    /** Its class skills. */
    private async insertSkills(def: ClassSeed, klassId: string) {
      await this.insertAll(
        klassSkillsInRules,
        def.classSkills.map((name) => ({
          klassId,
          skillId: idOf(this.ctx.skillMap, name, `${def.name}'s class skill`),
        })),
      );
    }

    /**
     * Seeds a class and its levels: their base attack, saves and skill points, spell slots, picks and granted feats,
     * and what it takes to reach each. The class's skills and feats must be seeded.
     */
    async seedClass(def: ClassSeed) {
      const [klass] = await this.db
        .insert(klassesInRules)
        .values({
          rulesetId: this.ctx.rulesetId,
          name: def.name,
          description: def.description,
          hd: def.hd,
          kind: def.kind ?? "pc",
        })
        .returning({ id: klassesInRules.id });
      const levels = await this.db
        .insert(klassLevelsInRules)
        .values(Array.from({ length: def.levels }, (_, i) => ({ klassId: klass.id, level: i + 1 })))
        .returning({ id: klassLevelsInRules.id, level: klassLevelsInRules.level });
      const levelIds: Record<number, string> = Object.fromEntries(levels.map((l) => [l.level, l.id]));

      await this.insertProperties(def, klass.id, levels);
      await this.insertSaves(def, levels);
      await this.insertLevelModifiers(def, levels);
      await this.insertLevelRequirements(def, levels, levelIds);
      await this.insertSkills(def, klass.id);
      await this.insertGrantedFeats(def, levelIds);
      return { klassId: klass.id, levelIds };
    }
  }
  return SeedingClasses;
}
