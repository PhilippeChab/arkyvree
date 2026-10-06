import { eq } from "drizzle-orm";

import type { SpellSeed } from "@/database/packages/dnd35/content/types.ts";
import { idsByName, type SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { insertAll, propertyRows, uniqueBy } from "@/database/packages/dnd35/seed/customization.ts";
import { powersAptitudesInRules, powersInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

/** A saving throw as its save and effect: "Will negates" is Will, "negates". Text that names no save is all effect. */
function parseSavingThrow(savingThrow: string | undefined, saveMap: Record<string, string>) {
  if (!savingThrow || savingThrow === "None") return { saveId: null, saveEffect: null };
  const match = savingThrow.match(/^(Will|Reflex|Fortitude)\s+(.+)$/);
  if (!match) return { saveId: null, saveEffect: savingThrow };
  return { saveId: saveMap[match[1]] ?? null, saveEffect: match[2] };
}

/** Adds a power to aptitudes, each at its level: the first link to an aptitude it isn't in yet. */
export async function linkPower(db: Db, powerId: string, links: { aptitudeId: string; level: number | null }[]) {
  const linked = new Set(
    (
      await db
        .select({ aptitudeId: powersAptitudesInRules.aptitudeId })
        .from(powersAptitudesInRules)
        .where(eq(powersAptitudesInRules.powerId, powerId))
    ).map((link) => link.aptitudeId),
  );
  const added = links.filter(({ aptitudeId }) => !linked.has(aptitudeId) && linked.add(aptitudeId));
  await insertAll(
    db,
    powersAptitudesInRules,
    added.map((link) => ({ powerId, ...link })),
  );
}

/**
 * Seeds spells with their properties, each in its spell lists at its level there, and adds them to the context.
 * A list the ruleset doesn't have is left out: the book that has it adds the spell to it.
 */
export async function seedPowers(db: Db, ctx: SeedContext, spells: SpellSeed[]) {
  if (spells.length === 0) return;

  const ids = idsByName(
    await db
      .insert(powersInRules)
      .values(
        spells.map((spell) => ({
          rulesetId: ctx.rulesetId,
          name: spell.name,
          description: spell.description,
          ...parseSavingThrow(spell.savingThrow, ctx.saveMap),
        })),
      )
      .returning({ id: powersInRules.id, name: powersInRules.name }),
  );
  Object.assign(ctx.powerMap, ids);

  const links = spells.flatMap((spell) =>
    spell.aptitudes
      .filter((aptitude) => ctx.aptMap[aptitude])
      .map((aptitude) => ({
        powerId: ids[spell.name],
        aptitudeId: ctx.aptMap[aptitude],
        level: spell.aptitudeLevels?.[aptitude] ?? spell.level,
      })),
  );
  await insertAll(
    db,
    powersAptitudesInRules,
    uniqueBy(links, (l) => `${l.powerId}:${l.aptitudeId}`),
  );
  await insertAll(
    db,
    propertiesInCustomization,
    uniqueBy(
      spells.flatMap((spell) => propertyRows(ids[spell.name], "powers", spell.properties)),
      (p) => `${p.entityId}:${p.type}:${p.value}`,
    ),
  );
}
