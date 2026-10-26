import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { gt } from "@/content/core/builders/customization/requirements.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { BabType, CasterLevelAdvancement, ClassSeed, SaveType } from "@/content/dnd3.5/builders/classes/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { getSpellLevelOpenings } from "@/database/seeders/dnd3.5/spellTable.ts";
import { requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { BAB_PROGRESSIONS, SAVE_PROGRESSIONS } from "@/vocabulary/dnd3.5/classes.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A class's levels, as seeded: each level's id and number. */
type Levels = { id: string; level: number }[];

/** The aptitudes a level that advances spellcasting gives a pick in, by the kind of caster it advances. */
const CASTER_LEVEL_APTITUDES: Record<CasterLevelAdvancement["type"], string[]> = {
  divine: ["Bonus Divine Caster Level"],
  arcane: ["Bonus Arcane Caster Level"],
  any: ["Bonus Caster Level"],
  dual: ["Bonus Arcane Caster Level", "Bonus Divine Caster Level"],
};

/** A level's base attack bonus, by the class's progression. */
function babAt(progression: BabType, level: number) {
  const { levels, points } = BAB_PROGRESSIONS[progression];
  return Math.floor((level * points) / levels);
}

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

/** A level's base save, by how good the class's save is. */
function saveAt(progression: SaveType, level: number) {
  const { base, hitDicePerPoint } = SAVE_PROGRESSIONS[progression];
  return base + Math.floor(level / hitDicePerPoint);
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
    /** A class's single links (`bonusSpellAbility`: the ability its bonus spells come from), each an ability's id. */
    private classLinks(def: ClassSeed): Record<string, string> {
      return Object.fromEntries(
        Object.entries(def.links ?? {}).map(([role, name]) => [
          role,
          this.idOf(this.ctx.abilityMap, name, `${def.name}'s ${role}`),
        ]),
      );
    }

    /** The feats its levels grant: its class features, its proficiencies and its free feats. */
    private async insertGrantedFeats(def: ClassSeed, levelIds: Record<number, string>) {
      const granted = (level: number, feat: string, aptitude: string, what: string) => ({
        role: "grants",
        fromId: levelIds[level],
        fromType: "class-levels",
        toId: this.idOf(this.ctx.featMap, feat, `${def.name}'s ${what}`),
        toType: "feats",
        viaId: this.idOf(this.ctx.aptMap, aptitude, `${def.name}'s ${what}`),
        free: true,
      });
      const featureAptitude = def.classFeatureAptitude;
      await this.insertLinks([
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
        "class-levels",
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
            entityType: "class-levels",
            level: "1",
            ...gt(`classes.${classSlug}.level`, level - 1),
          })),
        ...this.requirementRows(levelIds[1], "class-levels", def.requirements),
      ]);
    }

    /** Each level's base saves: its `baseBonus` links. */
    private async insertSaves(def: ClassSeed, levels: Levels) {
      const base = (fromId: string, save: string, amount: number) => ({
        role: "baseBonus",
        fromId,
        fromType: "class-levels",
        toId: this.ctx.saveMap[save],
        toType: "saves",
        amount,
      });
      await this.insertLinks(
        levels.flatMap(({ id, level }) => [
          base(id, "Fortitude", saveAt(def.saves.fortitude, level)),
          base(id, "Reflex", saveAt(def.saves.reflex, level)),
          base(id, "Will", saveAt(def.saves.will, level)),
        ]),
      );
    }

    /** Its class skills: its `classSkill` links. */
    private async insertSkills(def: ClassSeed, classId: string) {
      await this.insertLinks(
        def.classSkills.map((name) => ({
          role: "classSkill",
          fromId: classId,
          fromType: "classes",
          toId: this.idOf(this.ctx.skillMap, name, `${def.name}'s class skill`),
          toType: "skills",
        })),
      );
    }

    /**
     * Seeds a class and its levels: their base attack, saves and skill points, spell slots, picks and granted feats,
     * and what it takes to reach each. The class's skills and feats must be seeded.
     */
    async seedClass(def: ClassSeed) {
      const [classId] = await this.insertRows("classes", [
        {
          rulesetId: this.ctx.rulesetId,
          name: def.name,
          description: def.description,
          fields: def.fields,
          links: this.classLinks(def),
          partition: def.partition ?? PLAYER_CHARACTER_KIND,
        },
      ]);
      const klass = { id: classId };
      const numbers = Array.from({ length: def.levels }, (_, i) => i + 1);
      // Each level with its base attack and its skill points
      const levelRowIds = await this.insertRows(
        "class-levels",
        numbers.map((level) => ({
          ownerId: classId,
          position: level,
          fields: { [CLASS_LEVEL_BAB]: babAt(def.bab, level), [CLASS_LEVEL_SKILL_POINTS]: def.skillPoints },
        })),
      );
      const levels = numbers.map((level, i) => ({ id: levelRowIds[i], level }));
      const levelIds: Record<number, string> = Object.fromEntries(levels.map((l) => [l.level, l.id]));

      await this.insertSaves(def, levels);
      await this.insertLevelModifiers(def, levels);
      await this.insertLevelRequirements(def, levels, levelIds);
      await this.insertSkills(def, klass.id);
      await this.insertGrantedFeats(def, levelIds);
      return { classId: klass.id, levelIds };
    }
  }
  return SeedingClasses;
}
