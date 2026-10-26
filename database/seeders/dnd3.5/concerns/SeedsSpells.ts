import type { LeveledSpellSeed } from "@/content/dnd3.5/builders/spells/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding spells. */
export function SeedsSpells<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSpells extends Base {
    /**
     * Seeds spells with their fields and the save that resists them, each in its spell lists at its level there, and
     * adds them to the context.
     * A list the ruleset doesn't have is left out: the book that has it adds the spell to it.
     */
    async seedSpells(spells: LeveledSpellSeed[]) {
      if (spells.length === 0) return;

      const ids = await this.insertEntities(
        "spells",
        spells.map(({ name, description, fields, links }) => ({
          rulesetId: this.ctx.rulesetId,
          name,
          description,
          fields,
          ...(links?.resistedBy && {
            links: { resistedBy: this.idOf(this.ctx.saveMap, links.resistedBy, `${name}'s save`) },
          }),
        })),
      );
      Object.assign(this.ctx.spellMap, ids);

      const links = spells.flatMap((spell) =>
        spell.aptitudes
          .filter((aptitude) => this.ctx.aptMap[aptitude])
          .map((aptitude) => ({
            entityId: ids[spell.name],
            aptitudeId: this.ctx.aptMap[aptitude],
            level: spell.aptitudeLevels?.[aptitude] ?? spell.level,
          })),
      );
      await this.insertListings(
        "spells",
        this.uniqueBy(links, (l) => `${l.entityId}:${l.aptitudeId}`),
      );
    }
  }
  return SeedingSpells;
}
