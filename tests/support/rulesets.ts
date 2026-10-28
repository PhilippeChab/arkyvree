import type { InferInsertModel } from "drizzle-orm";

import { DND35_CORE_PACKAGE } from "@/content/dnd3.5/packages/core.ts";
import { RulesetSeeder } from "@/database/seeders/dnd3.5/RulesetSeeder.ts";
import type { Db } from "@/drizzle/database.ts";
import type { rulesetsInRules } from "@/drizzle/schema.ts";
import type { CowData, RulesetSources } from "@/engine/core/cow/index.ts";
import type { EntityKinds } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { EntityCopy, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { type RulesetEntityType, RulesetExtensions, Rulesets, RulesetSettings } from "@/server/repositories/index.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

import { uniqueId } from "./seed.ts";
import { makeSession } from "./users.ts";

/**
 * An entity as its kind's page describes it (`K`, its table): what `EntitiesService.getEntity` answers of it, which it
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
 * Copies an inherited entity into `rulesetId` (`EntityCopy`), on the chain given: what a first edit there copies, its
 * source refused as not found, by its type, when it's gone. The copied row.
 */
export async function copyEntity(
  database: Db,
  entityType: RulesetEntityType,
  entityId: string,
  ruleset: RulesetSources,
) {
  return (await EntityCopy.create(database, entityType, entityId, ruleset, `${entityType} not found`)).entity;
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

  const ruleset = await createTestRuleset(userId, {
    rulesetId: coreId,
    ancestorRulesetIds: [coreId],
    ...options,
  });

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
  const ruleset = await subscribeTestRuleset(fork.id, extensionIds);
  RulesetViews.invalidate(fork.id);
  return ruleset;
}

/**
 * An empty private draft ruleset owned by `userId` (`null` for a system ruleset), of the base rules the seeded content
 * is written for (3.5's), unless `values` names others. Pass `rulesetId` and `ancestorRulesetIds` to make it a fork,
 * and `extensionIds` the extensions it subscribes to, in their order. For one that already has the seeded
 * content, use `createSeededTestRuleset`.
 */
export async function createTestRuleset(
  userId: string | null,
  values: Partial<InferInsertModel<typeof rulesetsInRules>> & { extensionIds?: string[] } = {},
) {
  const { extensionIds = [], ...columns } = values;
  const [ruleset] = await Rulesets.create(db, {
    name: `Test Ruleset ${uniqueId()}`,
    description: "Test ruleset description",
    private: true,
    baseRules: DND35_BASE_RULES,
    userId,
    ...columns,
  });
  return extensionIds.length > 0 ? await subscribeTestRuleset(ruleset.id, extensionIds) : ruleset;
}

/**
 * A change to `ruleset`'s entities or customizations (`Edit`: `EntityEdit`, `CustomizationEdit`, `EntityNames`), as a
 * service makes it in its scope, outside one.
 */
export async function editRuleset<E>(Edit: new (ruleset: RulesetSources, cow: CowData) => E, ruleset: RulesetSources) {
  return new Edit(ruleset, await RulesetViews.getCowData(ruleset));
}

/**
 * A session of the user who owns `rulesetId` (the seed user's, for a system ruleset or none), who reads it whatever its
 * privacy (`RulesetsPolicy.canRead`): what a test of a ruleset's content, not of who may read it, reads it as.
 */
export async function ownerSessionOf(rulesetId: string) {
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  return makeSession(ruleset?.userId ?? SEED_USER_ID);
}

/** A ruleset's target paths of a kind, by its id, as the cache keeps them (`RulesetViews.getTargetPaths`). */
export async function readTargetPaths(rulesetId: string, kind: TargetPathKind) {
  return await RulesetViews.getTargetPaths((await Rulesets.findOne(db, { id: rulesetId }))!, kind);
}

/**
 * Subscribes a ruleset to extensions (`extensionIds`), after those it subscribes to, as its rows alone, none of a
 * subscribe's checks: the ruleset as it reads then.
 */
export async function subscribeTestRuleset(rulesetId: string, extensionIds: string[]) {
  await RulesetExtensions.upsert(db, { rulesetId, extensionIds });
  return (await Rulesets.findOne(db, { id: rulesetId }))!;
}
