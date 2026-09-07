import { eq } from "drizzle-orm";
import {
  aptitudesInRules,
  entitySnapshotsInRules,
  powersAptitudesInRules,
  powersInRules,
} from "@/drizzle/schema.ts";
import { propertiesInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";
import { parseSavingThrow } from "@/database/packages/dnd35/seed-utils/helpers.ts";
import type { SeedPowersContext } from "@/database/packages/dnd35/seed-utils/types.ts";

// ---------------------------------------------------------------------------
// seedPowers — bulk power insert with aptitudes, properties
// ---------------------------------------------------------------------------

type PowerSeedWithLevel = PowerSeed & { level: number };

export async function seedPowers(
  db: Db,
  rulesetId: string,
  powers: PowerSeedWithLevel[],
  ctx: SeedPowersContext,
): Promise<Record<string, string>> {
  if (powers.length === 0) return {};

  const { aptMap, saveMap } = ctx;

  // 1. Insert all powers
  const insertedPowers = await db
    .insert(powersInRules)
    .values(
      powers.map((p) => {
        const { saveId, saveEffect } = p.savingThrow
          ? parseSavingThrow(p.savingThrow, saveMap)
          : { saveId: null, saveEffect: null };
        return { rulesetId, name: p.name, description: p.description, saveId, saveEffect };
      }),
    )
    .returning({ id: powersInRules.id, name: powersInRules.name });

  const powerMap = Object.fromEntries(insertedPowers.map((p) => [p.name, p.id]));

  // 2. Insert aptitude links with level
  const aptitudeLinks: { powerId: string; aptitudeId: string; level: number | null }[] = [];
  const aptLinkSeen = new Set<string>();
  for (const p of powers) {
    const powerId = powerMap[p.name];
    for (const aptName of p.aptitudes) {
      const aptitudeId = aptMap[aptName];
      if (!aptitudeId) continue; // aptitude from another book — will be linked by that extension's seed
      const key = `${powerId}:${aptitudeId}`;
      if (aptLinkSeen.has(key)) continue;
      aptLinkSeen.add(key);
      const level = p.aptitudeLevels?.[aptName] ?? p.level;
      aptitudeLinks.push({ powerId, aptitudeId, level });
    }
  }
  if (aptitudeLinks.length > 0) {
    await db.insert(powersAptitudesInRules).values(aptitudeLinks);
  }

  // 3. Insert properties (deduplicate by entity+type+value)
  const properties: { entityId: string; entityType: string; type: string; value: string }[] = [];
  const propSeen = new Set<string>();
  for (const p of powers) {
    const entityId = powerMap[p.name];
    for (const prop of p.properties) {
      const key = `${entityId}:${prop.type}:${prop.value}`;
      if (propSeen.has(key)) continue;
      propSeen.add(key);
      properties.push({ entityId, entityType: "powers", ...prop });
    }
  }
  if (properties.length > 0) {
    await db.insert(propertiesInCustomization).values(properties);
  }

  return powerMap;
}

/**
 * After `cowPower`, copy the base power's aptitude links for any "X Spells"
 * aptitude (class spell lists, domain spell lists) to the new COW'd copy.
 *
 * Rationale: when a power is COW'd into an extension, the resulting
 * entity_snapshot causes the base to be excluded in any fork that extends
 * the extension. If the COW'd copy lacks the base's spell-list links, the
 * spell disappears from those lists in forks — e.g. Magic Missile COW'd
 * into CD for its Force Domain list would vanish from Wizard Spells in any
 * user ruleset that extends CD. Copy the links so visibility is preserved.
 *
 * Matches `cowSpellsIntoExtension`'s pattern: any aptitude whose name ends
 * in " Spells" is eligible, regardless of its ruleset.
 */
export async function copySpellListLinksFromBase(
  db: Db,
  basePowerId: string,
  newPowerId: string,
): Promise<number> {
  const SPELL_APT_PATTERN = /^(\w[\w ]*) Spells$/;

  const baseLinks = await db
    .select({
      aptitudeId: powersAptitudesInRules.aptitudeId,
      level: powersAptitudesInRules.level,
      aptitudeName: aptitudesInRules.name,
    })
    .from(powersAptitudesInRules)
    .innerJoin(aptitudesInRules, eq(aptitudesInRules.id, powersAptitudesInRules.aptitudeId))
    .where(eq(powersAptitudesInRules.powerId, basePowerId));

  const existingLinks = await db
    .select({ aptitudeId: powersAptitudesInRules.aptitudeId })
    .from(powersAptitudesInRules)
    .where(eq(powersAptitudesInRules.powerId, newPowerId));
  const existingIds = new Set(existingLinks.map((l) => l.aptitudeId));

  const toInsert = baseLinks
    .filter((l) => SPELL_APT_PATTERN.test(l.aptitudeName) && !existingIds.has(l.aptitudeId))
    .map((l) => ({ powerId: newPowerId, aptitudeId: l.aptitudeId, level: l.level }));

  if (toInsert.length > 0) {
    await db.insert(powersAptitudesInRules).values(toInsert);
  }
  return toInsert.length;
}

export async function cowPower(db: Db, basePowerId: string, extensionRulesetId: string): Promise<string | null> {
  const [base] = await db.select().from(powersInRules).where(eq(powersInRules.id, basePowerId));
  if (!base) return null;

  const [copy] = await db
    .insert(powersInRules)
    .values({
      rulesetId: extensionRulesetId,
      name: base.name,
      description: base.description,
      saveId: base.saveId,
      saveEffect: base.saveEffect,
    })
    .returning({ id: powersInRules.id });

  // Aptitude links aren't copied here because callers may want to control
  // which links are carried over vs added fresh. To preserve base spell-list
  // visibility (so a COW'd spell still appears under Wizard Spells, its base
  // domain spells, etc.), callers should invoke `copySpellListLinksFromBase`
  // after this. Callers then add any extension-specific aptitude links
  // (e.g. new domain spell lists) separately.

  // Copy properties
  const baseProps = await db
    .select()
    .from(propertiesInCustomization)
    .where(eq(propertiesInCustomization.entityId, basePowerId));

  if (baseProps.length > 0) {
    await db.insert(propertiesInCustomization).values(
      baseProps.map((p) => ({
        entityId: copy.id,
        entityType: p.entityType,
        value: p.value,
        type: p.type,
        description: p.description,
      })),
    );
  }

  // Entity snapshot
  await db.insert(entitySnapshotsInRules).values({
    rulesetId: extensionRulesetId,
    entityType: "powers",
    sourceEntityId: basePowerId,
    forkedEntityId: copy.id,
    contentHash: "seed",
  });

  return copy.id;
}
