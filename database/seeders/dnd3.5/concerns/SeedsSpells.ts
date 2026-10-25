import type { LeveledSpellSeed } from "@/content/dnd3.5/builders/spells/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A saving throw as its save and effect: "Will negates" is Will, "negates". Text that names no save is all effect. */
function parseSavingThrow(savingThrow: string | undefined, saveMap: Record<string, string>) {
  if (!savingThrow || savingThrow === "None") return { saveId: null, saveEffect: null };
  const match = savingThrow.match(/^(Will|Reflex|Fortitude)\s+(.+)$/);
  if (!match) return { saveId: null, saveEffect: savingThrow };
  return { saveId: saveMap[match[1]] ?? null, saveEffect: match[2] };
}

/** Seeding spells. */
export function SeedsSpells<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSpells extends Base {
    /**
     * Seeds spells with their properties, each in its spell lists at its level there, and adds them to the context.
     * A list the ruleset doesn't have is left out: the book that has it adds the spell to it.
     */
    async seedSpells(spells: LeveledSpellSeed[]) {
      if (spells.length === 0) return;

      const ids = await this.insertEntities(
        "spells",
        spells.map((spell) => ({
          rulesetId: this.ctx.rulesetId,
          name: spell.name,
          description: spell.description,
          ...parseSavingThrow(spell.savingThrow, this.ctx.saveMap),
        })),
      );
      Object.assign(this.ctx.spellMap, ids);

      const links = spells.flatMap((spell) =>
        spell.aptitudes
          .filter((aptitude) => this.ctx.aptMap[aptitude])
          .map((aptitude) => ({
            spellId: ids[spell.name],
            aptitudeId: this.ctx.aptMap[aptitude],
            level: spell.aptitudeLevels?.[aptitude] ?? spell.level,
          })),
      );
      await this.insertJoins(
        "spells_aptitudes",
        this.uniqueBy(links, (l) => `${l.spellId}:${l.aptitudeId}`),
      );
      await this.writeFields(
        spells.map((spell) =>
          this.propertySeedsWrite(
            ids[spell.name],
            "spells",
            this.uniqueBy(spell.properties ?? [], (p) => `${p.type}:${p.value}`),
          ),
        ),
      );
    }
  }
  return SeedingSpells;
}
