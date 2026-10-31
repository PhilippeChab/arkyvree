import type { InferInsertModel } from "drizzle-orm";

import { DND35_CORE_PACKAGE } from "@/content/dnd3.5/packages/core.ts";
import { RulesetSeeder } from "@/database/seeders/dnd3.5/RulesetSeeder.ts";
import type { Db } from "@/drizzle/database.ts";
import type { rulesetsInRules } from "@/drizzle/schema.ts";
import type { CowData, RulesetSources } from "@/engine/core/cow/index.ts";
import type { EntityKinds } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { EntityCopy, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { type RulesetEntityType, RulesetExtensions, Rulesets, RulesetSettings } from "@/server/repositories/index.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

import { uniqueId } from "./seed.ts";
import { makeSession } from "./users.ts";

/**
 * An entity as its kind's page describes it (`K`, its kind): what `EntitiesService.getEntity` answers of it, which it
 * types as any kind's (`describedAs` reads it as its own kind's).
 */
export type Described<K extends keyof EntityKinds> = ReturnType<EntityKinds[K]["describe"]>;

const writtenSeededRulesets = new Set<string>();

/** Whether an entity's description is of a kind (`type`): its row's. */
function isDescribed<K extends keyof EntityKinds>(type: K, entity: { type: string }): entity is Described<K> {
  return entity.type === type;
}

/**
 * An entity's description (`entity`, as `EntitiesService.getEntity` answers it, any kind's) as its kind's (`type`),
 * with what its kind's rules describe past every kind's (3.5's item's placement, its feat's modifiers): refused when
 * it's another kind's.
 */
export function describedAs<K extends keyof EntityKinds>(type: K, entity: { type: string }): Described<K> {
  if (!isDescribed(type, entity)) throw new Error(`A ${entity.type} entity is no ${type} entity`);
  return entity;
}

/** Drops the rules of the seeded rulesets the test wrote to, now that the rollback undid its rows. */
export function forgetSeededRulesetWrites() {
  for (const rulesetId of writtenSeededRulesets) RulesetViews.invalidate(rulesetId);
  writtenSeededRulesets.clear();
}

/**
 * Drops a seeded ruleset's cached rules after the test wrote rows straight into it, so what it reads next
 * sees them. The cache outlives the test's rollback, so the setup drops them again once the test ends.
 * A fork goes away with the rollback: after writing into one, `RulesetViews.invalidate` is enough.
 */
export function invalidateSeededRuleset(rulesetId: string) {
  writtenSeededRulesets.add(rulesetId);
  RulesetViews.invalidate(rulesetId);
}

/**
 * A cold read's cache, for a test that wrote rows straight into rulesets: drops the views of the rulesets it made
 * (`rulesetIds`) and of those built on them, and of the seeded rulesets it wrote into (`invalidateSeededRuleset`). The
 * seeded rulesets' rows it left alone stay cached: they read the same again.
 */
export function invalidateTestRulesets(...rulesetIds: string[]) {
  for (const rulesetId of [...rulesetIds, ...writtenSeededRulesets]) RulesetViews.invalidate(rulesetId);
}

/**
 * Copies an inherited entity into `ruleset` (`EntityCopy`), on its sources as stored: what a first edit there copies,
 * its source refused as not found, by its type, when it's gone. The copied row.
 */
export async function copyEntity(
  database: Db,
  entityType: RulesetEntityType,
  entityId: string,
  ruleset: { id: string },
) {
  const sources = (await Rulesets.findSources(database, { id: ruleset.id }))!;
  return (await EntityCopy.create(database, entityType, entityId, sources, `${entityType} not found`)).entity;
}

/**
 * Creates a test ruleset by forking the seeded D&D 3.5 base ruleset.
 * The fork inherits all entities (abilities, saves, skills, feats, etc.)
 * via COW without duplicating any data.
 */
export async function createSeededTestRuleset(
  userId: string,
  options: {
    description?: string;
    name?: string;
    private?: boolean;
    status?: "Draft" | "Published" | "Archived";
  } = {},
) {
  const coreId = await RulesetSeeder.findCoreRulesetId(db, DND35_CORE_PACKAGE, "A seeded test ruleset");

  const ruleset = await createTestRuleset(userId, { rulesetId: coreId, ...options });

  // Copy the ruleset's Settings, as a fork does (its skill point ability)
  await RulesetSettings.createCopy(db, { fromId: coreId, toId: ruleset.id });

  return ruleset;
}

/**
 * A seeded fork that also uses every extension shipped with the seeded base ruleset, in the order `Rulesets.findMany`
 * reads them (by when each was made, then by id).
 */
export async function createSeededTestRulesetWithExtensions(userId: string) {
  const fork = await createSeededTestRuleset(userId);
  const extensionIds = (await Rulesets.findMany(db, { system: true }))
    .filter((ruleset) => ruleset.kind === "extension" && ruleset.rulesetId === fork.rulesetId)
    .map((extension) => extension.id);
  await subscribeTestRuleset(fork.id, extensionIds);
  RulesetViews.invalidate(fork.id);
  return fork;
}

/**
 * An empty private draft ruleset owned by `userId` (`null` for a system ruleset; with `system: false`, an orphaned one,
 * its owner's account deleted), of the base rules the seeded content is written for (3.5's), unless `values` names
 * others. Pass `rulesetId` to make it a fork of that ruleset; `subscribeTestRuleset` subscribes it to extensions, in
 * their order. For one that already has the seeded content, use `createSeededTestRuleset`.
 */
export async function createTestRuleset(
  userId: string | null,
  values: Partial<InferInsertModel<typeof rulesetsInRules>> = {},
) {
  const [ruleset] = await Rulesets.create(db, {
    name: `Test Ruleset ${uniqueId()}`,
    description: "Test ruleset description",
    private: true,
    baseRules: DND35_BASE_RULES,
    userId,
    system: userId === null,
    ...values,
  });
  return ruleset;
}

/**
 * A change to `ruleset`'s entities or customizations (`Edit`: `EntityEdit`, `CustomizationEdit`, `EntityNames`), as a
 * service makes it in its scope, outside one, on its sources as stored.
 */
export async function editRuleset<E>(Edit: new (ruleset: RulesetSources, cow: CowData) => E, ruleset: { id: string }) {
  const sources = await sourcesOf(ruleset.id);
  return new Edit(sources, await RulesetViews.getCowData(sources));
}

/**
 * A session of the user who owns `rulesetId` (the seed user's, for a system ruleset or none), who reads it whatever its
 * privacy (`RulesetsPolicy.canRead`): what a test of a ruleset's content, not of who may read it, reads it as.
 */
export async function ownerSessionOf(rulesetId: string) {
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  return makeSession(ruleset?.userId ?? SEED_USER_ID);
}

/** A ruleset's copy-on-write data, by its id, as the cache keeps it (`RulesetViews.getCowData`). */
export async function readCowData(rulesetId: string) {
  return await RulesetViews.getCowData(await sourcesOf(rulesetId));
}

/** A ruleset's target paths of a kind, by its id, as the cache keeps them (`RulesetViews.getTargetPaths`). */
export async function readTargetPaths(rulesetId: string, kind: TargetPathKind) {
  return await withRulesetScope(db, rulesetId, async (scope) => await RulesetViews.getTargetPaths(scope, kind));
}

/** A ruleset's view, by its id, as its scope composes it (`withRulesetScope`). */
export async function readView(rulesetId: string) {
  return await withRulesetScope(db, rulesetId, async (scope) => scope.rulesetData);
}

/** A ruleset's sources, by its id, as a scope reads them (`Rulesets.findSources`). */
export async function sourcesOf(rulesetId: string) {
  return (await Rulesets.findSources(db, { id: rulesetId }))!;
}

/**
 * Subscribes a ruleset to extensions (`extensionIds`), after those it subscribes to, as its rows alone, none of a
 * subscribe's checks.
 */
export async function subscribeTestRuleset(rulesetId: string, extensionIds: string[]) {
  await RulesetExtensions.upsert(db, { rulesetId, extensionIds });
}
