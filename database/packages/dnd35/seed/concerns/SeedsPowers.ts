import type { SpellSeed } from "@/database/packages/dnd35/content/types.ts";
import { idsByName } from "@/database/packages/dnd35/seed/context.ts";
import { propertyRows, uniqueBy } from "@/database/packages/dnd35/seed/customizationRows.ts";
import type { SeederState } from "@/database/packages/dnd35/seed/SeederState.ts";
import { powersAptitudesInRules, powersInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A saving throw as its save and effect: "Will negates" is Will, "negates". Text that names no save is all effect. */
function parseSavingThrow(savingThrow: string | undefined, saveMap: Record<string, string>) {
  if (!savingThrow || savingThrow === "None") return { saveId: null, saveEffect: null };
  const match = savingThrow.match(/^(Will|Reflex|Fortitude)\s+(.+)$/);
  if (!match) return { saveId: null, saveEffect: savingThrow };
  return { saveId: saveMap[match[1]] ?? null, saveEffect: match[2] };
}

/** Seeding spells. */
export function SeedsPowers<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingPowers extends Base {
    /**
     * Seeds spells with their properties, each in its spell lists at its level there, and adds them to the context.
     * A list the ruleset doesn't have is left out: the book that has it adds the spell to it.
     */
    async seedPowers(spells: SpellSeed[]) {
      if (spells.length === 0) return;

      const ids = idsByName(
        await this.db
          .insert(powersInRules)
          .values(
            spells.map((spell) => ({
              rulesetId: this.ctx.rulesetId,
              name: spell.name,
              description: spell.description,
              ...parseSavingThrow(spell.savingThrow, this.ctx.saveMap),
            })),
          )
          .returning({ id: powersInRules.id, name: powersInRules.name }),
      );
      Object.assign(this.ctx.powerMap, ids);

      const links = spells.flatMap((spell) =>
        spell.aptitudes
          .filter((aptitude) => this.ctx.aptMap[aptitude])
          .map((aptitude) => ({
            powerId: ids[spell.name],
            aptitudeId: this.ctx.aptMap[aptitude],
            level: spell.aptitudeLevels?.[aptitude] ?? spell.level,
          })),
      );
      await this.insertAll(
        powersAptitudesInRules,
        uniqueBy(links, (l) => `${l.powerId}:${l.aptitudeId}`),
      );
      await this.insertAll(
        propertiesInCustomization,
        uniqueBy(
          spells.flatMap((spell) => propertyRows(ids[spell.name], "powers", spell.properties)),
          (p) => `${p.entityId}:${p.type}:${p.value}`,
        ),
      );
    }
  }
  return SeedingPowers;
}
