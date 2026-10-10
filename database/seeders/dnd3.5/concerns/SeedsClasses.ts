import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { gt } from "@/content/core/builders/customization/requirements.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { DND35_BASE_RULES } from "@/content/dnd3.5/baseRules.ts";
import type { BabType, ClassSeed, SaveType } from "@/content/dnd3.5/builders/classes/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { getSpellLevelOpenings } from "@/database/seeders/dnd3.5/spellTable.ts";
import {
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelSavesInRules,
  klassLevelsInRules,
  klassSkillsInRules,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A class's levels, as seeded: each level's id and number. */
type Levels = { id: string; level: number }[];

/** A level's base attack bonus, by the class's progression. */
const BAB: Record<BabType, (level: number) => number> = {
  good: (level) => level,
  medium: (level) => Math.floor((level * 3) / 4),
  poor: (level) => Math.floor(level / 2),
};

/** The aptitudes a level that advances spellcasting gives a pick in, by the kind of caster it advances. */
const CASTER_LEVEL_APTITUDES = {
  divine: ["Bonus Divine Caster Level"],
  arcane: ["Bonus Arcane Caster Level"],
  any: ["Bonus Caster Level"],
  dual: ["Bonus Arcane Caster Level", "Bonus Divine Caster Level"],
};

/** A level's base save, by how good the class's save is. */
const SAVE: Record<SaveType, (level: number) => number> = {
  good: (level) => Math.floor(level / 2) + 2,
  poor: (level) => Math.floor(level / 3),
};

/** A spellcaster's slots in one of its lists, gated by its requirements. */
function listSlots(
  spells: NonNullable<ClassSeed["spells"]>,
  list: { requirements: RequirementEntry[]; slug: string },
): (ModifierSeed & { level: number })[] {
  const slot = (spellLevel: number, kind: string) =>
    `aptitudes.${list.slug}.${spellLevel + (spells.noCantrips ? 1 : 0)}.${kind}`;
  const modifier = (level: number, target: string, value: string, operator: string) => ({
    level,
    target,
    value,
    valueType: "number",
    operator,
    ...(list.requirements.length > 0 && { requirements: list.requirements }),
  });
  return [
    ...tableGains(spells.perDay).map((g) => modifier(g.level, slot(g.spellLevel, "uses"), String(g.delta), "add")),
    ...tableGains(spells.known ?? []).map((g) =>
      modifier(g.level, slot(g.spellLevel, "allowed"), String(g.delta), "add"),
    ),
    ...(spells.knowAll
      ? getSpellLevelOpenings(spells.perDay).map((o) => modifier(o.level, slot(o.spellLevel, "allowed"), "-1", "set"))
      : []),
  ];
}

/**
 * A spellcaster's slots, by class level: its spells a day, and the spells it knows (`known`) or can prepare,
 * all of each level it can cast (`knowAll`). They go to its list, or to each of its `lists` while that one's
 * requirements are met.
 */
function spellSlots(spells: NonNullable<ClassSeed["spells"]>): (ModifierSeed & { level: number })[] {
  const lists = spells.lists ?? [{ slug: spells.slug, requirements: [] }];
  return lists.flatMap((list) => listSlots(spells, list));
}

/** What a table (by class level, then spell level) adds at each class level: `delta` more at `spellLevel`. */
function tableGains(table: number[][]) {
  return table.flatMap((row, i) =>
    row.flatMap((count, spellLevel) => {
      const delta = count - (table[i - 1]?.[spellLevel] ?? 0);
      return delta > 0 ? [{ level: i + 1, spellLevel, delta }] : [];
    }),
  );
}

/** Seeding classes. */
export function SeedsClasses<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingClasses extends Base {
    /** The feats its levels grant: its class features, its proficiencies and its free feats. */
    private async insertGrantedFeats(def: ClassSeed, levelIds: Record<number, string>) {
      const granted = (level: number, feat: string, aptitude: string, what: string) => ({
        klassLevelId: levelIds[level],
        featId: this.idOf(this.ctx.featMap, feat, `${def.name}'s ${what}`),
        aptitudeId: this.idOf(this.ctx.aptMap, aptitude, `${def.name}'s ${what}`),
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
            ...picks.filter((pick) => pick.levels.includes(level)).map((pick) => bonus(pick.target, 1)),
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
            ...gt(`classes.${classSlug}.level`, level - 1),
          })),
        ...this.requirementRows(levelIds[1], "klass_levels", def.requirements),
      ]);
    }

    /** Its properties and its levels': its bonus spell ability and caster type, each level's base attack and points. */
    private async insertProperties(def: ClassSeed, klassId: string, levels: Levels) {
      const bonusSpellAbilityId = (def.bonusSpellAbility && this.ctx.abilityMap[def.bonusSpellAbility]) || null;
      await this.insertAll(propertiesInCustomization, [
        ...this.propertyRows(
          klassId,
          "klasses",
          Engine.forRules(DND35_BASE_RULES).toEntityProperties("klasses", {
            bonusSpellAbilityId,
            casterType: def.casterType ?? null,
          }),
        ),
        ...levels.flatMap(({ id, level }) =>
          this.propertyRows(
            id,
            "klass_levels",
            Engine.forRules(DND35_BASE_RULES).toEntityProperties("klassLevels", {
              bab: BAB[def.bab](level),
              skills: def.skillPoints,
            }),
          ),
        ),
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
          skillId: this.idOf(this.ctx.skillMap, name, `${def.name}'s class skill`),
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
