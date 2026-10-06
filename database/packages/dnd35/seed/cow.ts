/**
 * An extension changes an inherited feat or power the way a fork does: it copies it (copy on write) and records the
 * copy in `entity_snapshots`, so the ruleset shows the copy in place of the original.
 */

import { and, eq, like } from "drizzle-orm";

import type { CowFeatEntry, CowSpellEntry } from "@/database/packages/dnd35/content/types.ts";
import type { SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { insertAll } from "@/database/packages/dnd35/seed/customization.ts";
import { linkPower } from "@/database/packages/dnd35/seed/powers.ts";
import {
  aptitudesInRules,
  entitySnapshotsInRules,
  featsAptitudesInRules,
  featsInRules,
  modifiersInCustomization,
  powersAptitudesInRules,
  powersInRules,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

/**
 * Adds class levels to a feat's first-level `or` of requirements, which a single first-level requirement becomes.
 * A feat with neither gets none.
 */
async function addClassLevelAlternatives(db: Db, featId: string, classLevels: CowFeatEntry["requirements"]) {
  if (classLevels.length === 0) return;
  const requirements = await db
    .select()
    .from(requirementsInCustomization)
    .where(eq(requirementsInCustomization.entityId, featId));
  const topLevel = requirements.filter((r) => /^\d+$/.test(r.level));
  let group = topLevel.find((r) => !r.target && r.chainingOperator === "or");
  if (!group) {
    const single = topLevel.find((r) => r.target && !r.chainingOperator);
    if (!single) return;
    await db
      .update(requirementsInCustomization)
      .set({ target: null, operator: null, value: null, valueType: null, chainingOperator: "or" })
      .where(eq(requirementsInCustomization.id, single.id));
    await db.insert(requirementsInCustomization).values({
      entityId: featId,
      entityType: "feats",
      level: `${single.level}.1`,
      target: single.target,
      operator: single.operator,
      value: single.value,
      valueType: single.valueType,
    });
    group = single;
  }

  const children = await db
    .select({ level: requirementsInCustomization.level })
    .from(requirementsInCustomization)
    .where(
      and(
        eq(requirementsInCustomization.entityId, featId),
        like(requirementsInCustomization.level, `${group.level}.%`),
      ),
    );
  const next = Math.max(0, ...children.map((r) => Number(r.level.split(".").pop()))) + 1;
  await db.insert(requirementsInCustomization).values(
    classLevels.map(({ className, level }, i) => ({
      entityId: featId,
      entityType: "feats",
      level: `${group.level}.${next + i}`,
      target: `classes.${className}.level`,
      operator: "greater_than_or_equal",
      value: String(level),
      valueType: "number",
    })),
  );
}

async function copyRequirements(db: Db, fromId: string, toId: string) {
  const rows = await db
    .select()
    .from(requirementsInCustomization)
    .where(eq(requirementsInCustomization.entityId, fromId));
  await insertAll(
    db,
    requirementsInCustomization,
    rows.map(({ entityType, level, target, operator, value, valueType, chainingOperator }) => ({
      entityId: toId,
      entityType,
      level,
      target,
      operator,
      value,
      valueType,
      chainingOperator,
    })),
  );
}

/** Copies an entity's requirements, modifiers (with theirs) and properties onto its copy. */
async function copyCustomizations(db: Db, fromId: string, toId: string) {
  await copyRequirements(db, fromId, toId);
  for (const modifier of await db
    .select()
    .from(modifiersInCustomization)
    .where(eq(modifiersInCustomization.sourceId, fromId))) {
    const { sourceType, target, value, valueType, operator } = modifier;
    const [copy] = await db
      .insert(modifiersInCustomization)
      .values({ sourceId: toId, sourceType, target, value, valueType, operator })
      .returning({ id: modifiersInCustomization.id });
    await copyRequirements(db, modifier.id, copy.id);
  }
  const properties = await db
    .select()
    .from(propertiesInCustomization)
    .where(eq(propertiesInCustomization.entityId, fromId));
  await insertAll(
    db,
    propertiesInCustomization,
    properties.map(({ entityType, type, value, description }) => ({
      entityId: toId,
      entityType,
      type,
      value,
      description,
    })),
  );
}

/** Adds a power to the spell lists another one is in, at the same levels. */
async function copySpellLists(db: Db, fromId: string, toId: string) {
  const links = await db
    .select({
      aptitudeId: powersAptitudesInRules.aptitudeId,
      level: powersAptitudesInRules.level,
      aptitude: aptitudesInRules.name,
    })
    .from(powersAptitudesInRules)
    .innerJoin(aptitudesInRules, eq(aptitudesInRules.id, powersAptitudesInRules.aptitudeId))
    .where(eq(powersAptitudesInRules.powerId, fromId));
  await linkPower(
    db,
    toId,
    links.filter(({ aptitude }) => /^(\w[\w ]*) Spells$/.test(aptitude)),
  );
}

async function recordCopy(
  db: Db,
  rulesetId: string,
  entityType: string,
  sourceEntityId: string,
  forkedEntityId: string,
) {
  await db
    .insert(entitySnapshotsInRules)
    .values({ rulesetId, entityType, sourceEntityId, forkedEntityId, contentHash: "seed" });
}

/** Copies an inherited feat into the ruleset, with its aptitudes and customizations. */
async function cowFeat(db: Db, featId: string, rulesetId: string) {
  const [feat] = await db.select().from(featsInRules).where(eq(featsInRules.id, featId));
  const [copy] = await db
    .insert(featsInRules)
    .values({
      rulesetId,
      name: feat.name,
      description: feat.description,
      stackable: feat.stackable,
      selectable: feat.selectable,
      generated: feat.generated,
    })
    .returning({ id: featsInRules.id });
  const aptitudes = await db.select().from(featsAptitudesInRules).where(eq(featsAptitudesInRules.featId, featId));
  await insertAll(
    db,
    featsAptitudesInRules,
    aptitudes.map(({ aptitudeId }) => ({ featId: copy.id, aptitudeId })),
  );
  await copyCustomizations(db, featId, copy.id);
  await recordCopy(db, rulesetId, "feats", featId, copy.id);
  return copy.id;
}

/**
 * Copies an inherited power into the ruleset, with its customizations and its spell lists ("X Spells" aptitudes):
 * the copy hides the original in the rulesets that extend this one, so it keeps the original's lists.
 */
async function cowPower(db: Db, powerId: string, rulesetId: string) {
  const [power] = await db.select().from(powersInRules).where(eq(powersInRules.id, powerId));
  const [copy] = await db
    .insert(powersInRules)
    .values({
      rulesetId,
      name: power.name,
      description: power.description,
      saveId: power.saveId,
      saveEffect: power.saveEffect,
    })
    .returning({ id: powersInRules.id });
  await copyCustomizations(db, powerId, copy.id);
  await recordCopy(db, rulesetId, "powers", powerId, copy.id);
  await copySpellLists(db, powerId, copy.id);
  return copy.id;
}

/**
 * Copies the inherited feats an extension changes: each is taken in more aptitudes, and more class levels qualify
 * for it (added to its `or` of requirements). Its classes then grant the copy.
 */
export async function cowFeatsIntoExtension(db: Db, ctx: SeedContext, entries: CowFeatEntry[]) {
  for (const entry of entries) {
    const featId = ctx.featMap[entry.feat];
    if (!featId) continue;
    const copyId = await cowFeat(db, featId, ctx.rulesetId);
    ctx.featMap[entry.feat] = copyId;
    await addClassLevelAlternatives(db, copyId, entry.requirements);
    await insertAll(
      db,
      featsAptitudesInRules,
      entry.aptitudes
        .filter((aptitude) => ctx.aptMap[aptitude])
        .map((aptitude) => ({ featId: copyId, aptitudeId: ctx.aptMap[aptitude] })),
    );
  }
}

/** The ruleset's own power named so, copying the inherited one first when it has none. */
export async function ownPower(db: Db, ctx: SeedContext, name: string): Promise<string | undefined> {
  const inheritedId = ctx.inheritedPowerMap[name];
  if (!ctx.powerMap[name] && inheritedId) ctx.powerMap[name] = await cowPower(db, inheritedId, ctx.rulesetId);
  return ctx.powerMap[name];
}

/**
 * Adds inherited spells to an extension's spell lists: it copies each first (a spell it has already copied, or
 * has its own of, it adds as is), keeping the original's spell lists.
 */
export async function cowSpellsIntoExtension(db: Db, ctx: SeedContext, entries: CowSpellEntry[]) {
  for (const entry of entries) {
    // A power of its own keeps the inherited one's spell lists too, as a copy does.
    const inheritedId = ctx.inheritedPowerMap[entry.spell];
    if (ctx.powerMap[entry.spell] && inheritedId) await copySpellLists(db, inheritedId, ctx.powerMap[entry.spell]);
    const powerId = await ownPower(db, ctx, entry.spell);
    if (!powerId) continue;
    await linkPower(
      db,
      powerId,
      entry.aptitudes
        .filter(({ aptitude }) => ctx.aptMap[aptitude])
        .map(({ aptitude, level }) => ({ aptitudeId: ctx.aptMap[aptitude], level })),
    );
  }
}
