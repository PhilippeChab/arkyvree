import { and, eq } from "drizzle-orm";
import { powersAptitudesInRules, powersInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { copySpellListLinksFromBase, cowPower } from "@/database/packages/dnd35/seed-utils/seed-powers.ts";

export type CowSpellEntry = {
  spell: string;
  aptitudes: { aptitude: string; level: number }[];
};

/**
 * COW base spells into an extension and add per-class aptitude links with
 * correct levels. Unlike `cowBasePowersIntoExtension` (which used `spell.level`
 * — the global minimum), each aptitude link gets the level specific to that
 * class from the spell's levelEntries.
 */
export async function cowSpellsIntoExtension(
  db: Db,
  baseRulesetId: string,
  extensionId: string,
  entries: CowSpellEntry[],
  aptMap: Record<string, string>,
): Promise<void> {
  if (entries.length === 0) return;

  // Load base powers by name
  const basePowers = await db
    .select({ id: powersInRules.id, name: powersInRules.name })
    .from(powersInRules)
    .where(eq(powersInRules.rulesetId, baseRulesetId));
  const basePowerMap = Object.fromEntries(basePowers.map((p) => [p.name, p.id]));

  // Load existing extension powers (idempotent: skip spells already COW'd)
  const extPowers = await db
    .select({ id: powersInRules.id, name: powersInRules.name })
    .from(powersInRules)
    .where(eq(powersInRules.rulesetId, extensionId));
  const extPowerMap = Object.fromEntries(extPowers.map((p) => [p.name, p.id]));

  const cowCache = new Map<string, string>(); // basePowerId → newPowerId

  for (const entry of entries) {
    const basePowerId = basePowerMap[entry.spell];
    const existingExtId = extPowerMap[entry.spell];
    if (!basePowerId && !existingExtId) continue;

    let newPowerId = (basePowerId ? cowCache.get(basePowerId) : undefined) ?? existingExtId;
    if (!newPowerId && basePowerId) {
      const cowId = await cowPower(db, basePowerId, extensionId);
      if (!cowId) continue;
      newPowerId = cowId;
      cowCache.set(basePowerId, newPowerId);
    }
    if (!newPowerId) continue;

    // Ensure COW'd copy has ALL spell aptitude links from the base power
    // (class spells AND domain spells) so it appears on the same spell lists.
    // Domain links are included because resolveOverrides deduplicates at read
    // time — without them, forked rulesets with extensions would show COW'd
    // spells without their domain aptitude badges.
    if (basePowerId) {
      await copySpellListLinksFromBase(db, basePowerId, newPowerId);
    }

    for (const apt of entry.aptitudes) {
      const aptitudeId = aptMap[apt.aptitude];
      if (!aptitudeId) continue;

      // Skip if this aptitude link already exists (idempotent)
      const [existingLink] = await db
        .select({ powerId: powersAptitudesInRules.powerId })
        .from(powersAptitudesInRules)
        .where(
          and(
            eq(powersAptitudesInRules.powerId, newPowerId),
            eq(powersAptitudesInRules.aptitudeId, aptitudeId),
          ),
        )
        .limit(1);
      if (existingLink) continue;

      await db.insert(powersAptitudesInRules).values({
        powerId: newPowerId,
        aptitudeId,
        level: apt.level,
      });
    }
  }
}
