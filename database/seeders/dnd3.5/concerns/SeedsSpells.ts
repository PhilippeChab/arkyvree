import type { LeveledSpellSeed } from "@/content/dnd3.5/builders/spells/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";
import { SPELL_SAVE_EFFECT } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A saving throw as its save (its `resistedBy` link) and effect (its `SPELL_SAVE_EFFECT`): "Will negates" is Will,
 * "negates". Text that names no save is all effect.
 */
function parseSavingThrow(savingThrow: string | undefined, saveMap: Record<string, string>) {
  if (!savingThrow || savingThrow === "None") return {};
  const match = savingThrow.match(/^(Will|Reflex|Fortitude)\s+(.+)$/);
  if (!match) return { fields: { [SPELL_SAVE_EFFECT]: savingThrow } };
  return { fields: { [SPELL_SAVE_EFFECT]: match[2] }, links: { resistedBy: saveMap[match[1]] ?? null } };
}

/** Seeding spells. */
export function SeedsSpells<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSpells extends Base {
    /**
     * Seeds spells with their fields, each in its spell lists at its level there, and adds them to the context.
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
            entityId: ids[spell.name],
            aptitudeId: this.ctx.aptMap[aptitude],
            level: spell.aptitudeLevels?.[aptitude] ?? spell.level,
          })),
      );
      await this.insertListings(
        "spells",
        this.uniqueBy(links, (l) => `${l.entityId}:${l.aptitudeId}`),
      );
      await this.writeFields(
        spells.map((spell) => ({
          id: ids[spell.name],
          type: "spells",
          values: Engine.forRules(DND35_BASE_RULES).toFieldsWrite("spells", spell.fields),
        })),
      );
    }
  }
  return SeedingSpells;
}
