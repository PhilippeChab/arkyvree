import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import { classSkills } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { spellRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import type { ClassSeed } from "@/content/dnd5.2/builders/classes/types.ts";
import { skillProficiency } from "@/content/dnd5.2/builders/feats/proficiencies.ts";
import type { BaseSeeder } from "@/database/seeders/dnd5.2/BaseSeeder.ts";
import { requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd5.2/classes.ts";

/** A class's levels, as seeded: each level's id and number. */
type Levels = { id: string; level: number }[];

/** A class's single links, each naming a row by its name: the ability's or the feat's it names, by role. */
const LINKED_KINDS = {
  spellcastingAbility: "abilityMap",
  startingProficiencies: "featMap",
  multiclassProficiencies: "featMap",
} as const;

/**
 * A spellcaster's rooms in its spell list, by class level: what its table (`known`, by class level, then spell level
 * from the cantrips' 0) adds at each, a level's new spells at the spell level they're counted at.
 */
function spellRooms(spells: NonNullable<ClassSeed["spells"]>): (ModifierSeed & { level: number })[] {
  return spells.known.flatMap((row, i) =>
    row.flatMap((count, spellLevel) => {
      const delta = count - (spells.known[i - 1]?.[spellLevel] ?? 0);
      return delta === 0 ? [] : [{ level: i + 1, ...spellRoom(spells.list, spellLevel, delta) }];
    }),
  );
}

/** Seeding classes. */
export function SeedsClasses<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingClasses extends Base {
    /**
     * A class's single links (`links`, by role, each a name): its spellcasting ability, an ability's id, and its
     * starting and multiclass proficiencies, a feat's.
     */
    private classLinks(def: ClassSeed): Record<string, string> {
      return Object.fromEntries(
        Object.entries(def.links ?? {}).map(([role, name]) => [
          role,
          this.idOf(this.ctx[LINKED_KINDS[role as keyof typeof LINKED_KINDS]], name, `${def.name}'s ${role}`),
        ]),
      );
    }

    /**
     * The pools that draw its list's spells of a level (`spells.drawnBy`): each one's `drawsFrom` link to its list, at
     * that level (a warlock's "Mystic Arcanum (Level 6)", its list's level 6 spells).
     */
    private async insertDrawingPools(def: ClassSeed) {
      const { drawnBy = [], list } = def.spells ?? {};
      if (!list || drawnBy.length === 0) return;
      const toId = this.idOf(this.ctx.aptMap, list, `${def.name}'s spell list`);
      await this.insertLinks(
        drawnBy.map(({ level, pool }) => ({
          role: "drawsFrom",
          fromId: this.idOf(this.ctx.aptMap, pool, `${def.name}'s pool drawing from its list`),
          fromType: "aptitudes",
          toId,
          toType: "aptitudes",
          tier: level,
        })),
      );
    }

    /**
     * Its first level's requirements: a multiclass's, 13 in its primary abilities, which the engine checks past a
     * character's first class. A later level requires none of the one before, which the levels are taken in.
     */
    private async insertFirstLevelRequirements(def: ClassSeed, levelIds: Record<number, string>) {
      await this.insertAll(
        requirementsInCustomization,
        this.requirementRows(levelIds[1], "class-levels", def.requirements),
      );
    }

    /** The features its levels grant, each a feat through its features' pool (`featurePool`), at each level it's at. */
    private async insertGrantedFeats(def: ClassSeed, levelIds: Record<number, string>) {
      const viaId = this.idOf(this.ctx.aptMap, def.featurePool, `${def.name}'s features`);
      await this.insertLinks(
        def.features.map(([level, feat]) => ({
          role: "grants",
          fromId: levelIds[level],
          fromType: "class-levels",
          toId: this.idOf(this.ctx.featMap, feat, `${def.name}'s feature at level ${level}`),
          toType: "feats",
          viaId,
          free: true,
        })),
      );
    }

    /** Its levels' modifiers: the rooms they give in its pools, and its spells' in its spell list. */
    private async insertLevelModifiers(def: ClassSeed, levels: Levels) {
      const modifiers = [...(def.modifiers ?? []), ...(def.spells ? spellRooms(def.spells) : [])];
      await this.insertModifiers(
        "class-levels",
        levels.flatMap(({ id, level }) =>
          modifiers
            .filter((modifier) => modifier.level === level)
            .map(({ level: _level, ...modifier }) => ({ sourceId: id, modifier })),
        ),
      );
    }

    /**
     * Its skill picks: each skill's Skill Proficiency, listed in the class's skills' pool ("Fighter Skills"); none for
     * a class whose picks are any skill's (a bard's, in the Skill Proficiencies pool).
     */
    private async insertSkillPicks(def: ClassSeed) {
      if (def.classSkills.length === 0) return;
      const what = `${def.name}'s skills`;
      const toId = this.idOf(this.ctx.aptMap, classSkills(def.name), what);
      await this.insertListings(
        "feats",
        def.classSkills.map((skill) => ({ fromId: this.idOf(this.ctx.featMap, skillProficiency(skill), what), toId })),
      );
    }

    /**
     * Seeds a class, in its partition (its kind's default without one), and its 20 levels: the rooms they give, its
     * features they grant, and what a multiclass takes to reach its first; the pools that draw from its list; and its
     * skill picks. Its feats, its skills' and its pools must be seeded.
     */
    async seedClass(def: ClassSeed) {
      const [classId] = await this.insertRows("classes", [
        {
          rulesetId: this.ctx.rulesetId,
          name: def.name,
          description: def.description,
          fields: def.fields,
          links: this.classLinks(def),
          partition: def.partition,
        },
      ]);
      const numbers = Array.from({ length: MAX_CLASS_LEVEL }, (_, i) => i + 1);
      const levelRowIds = await this.insertRows(
        "class-levels",
        numbers.map((level) => ({ ownerId: classId, position: level })),
      );
      const levels = numbers.map((level, i) => ({ id: levelRowIds[i], level }));
      const levelIds: Record<number, string> = Object.fromEntries(levels.map((l) => [l.level, l.id]));

      await this.insertLevelModifiers(def, levels);
      await this.insertFirstLevelRequirements(def, levelIds);
      await this.insertGrantedFeats(def, levelIds);
      await this.insertDrawingPools(def);
      await this.insertSkillPicks(def);
      return { classId, levelIds };
    }
  }
  return SeedingClasses;
}
