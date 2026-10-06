import { eq, type InferInsertModel } from "drizzle-orm";

import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { aptitudesInRules, rulesetExtensionsInRules, type rulesetsInRules } from "@/drizzle/schema.ts";
import { RulesetCache, type RulesetSources } from "@/server/cache/rulesetCache/index.ts";
import { EntityCopy, RulesetEdit } from "@/server/cow/index.ts";
import { type Db, db } from "@/server/database/index.ts";
import { Properties, type RulesetEntityType, Rulesets } from "@/server/repositories/index.ts";
import { api, expectOk } from "@/tests/support/api.ts";
import { insertRows } from "@/tests/support/database.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const writtenSeededRulesets = new Set<string>();

/** Drops the rules of the seeded rulesets the test wrote to, now that the rollback undid its rows. */
export function forgetSeededRulesetWrites() {
  for (const rulesetId of writtenSeededRulesets) RulesetCache.invalidate(rulesetId);
  writtenSeededRulesets.clear();
}

/**
 * Drops a seeded ruleset's cached rules after the test wrote rows straight into it, so what it reads next
 * sees them. The cache outlives the test's rollback, so the setup drops them again once the test ends.
 * A fork goes away with the rollback: after writing into one, `RulesetCache.invalidate` is enough.
 */
export function invalidateSeededRuleset(rulesetId: string) {
  writtenSeededRulesets.add(rulesetId);
  RulesetCache.invalidate(rulesetId);
}

/**
 * Copies an inherited entity into `rulesetId` (`EntityCopy`), on the chain given: what a first edit there copies. The
 * copied row.
 */
export async function copyEntity(
  database: Db,
  entityType: RulesetEntityType,
  entityId: string,
  ruleset: RulesetSources,
) {
  return (await EntityCopy.create(database, entityType, entityId, ruleset)).entity;
}

/** A new seeded fork of the seed user's with an aptitude of its own: the fork's `id` and the `aptitudeId`. */
export async function createSeededForkWithAptitude() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  return { id, aptitudeId: (await postAptitude(id)).id };
}

/**
 * Creates a test ruleset by forking the seeded D&D 3.5 base ruleset.
 * The fork inherits all entities (abilities, saves, skills, feats, etc.)
 * via COW without duplicating any data.
 */
export async function createSeededTestRuleset(
  userId: string,
  options: {
    name?: string;
    description?: string;
    private?: boolean;
    status?: "Draft" | "Published" | "Archived";
  } = {},
) {
  const coreId = await RulesetSeeder.findCoreRulesetId(db, "A seeded test ruleset");

  const ruleset = await createTestRuleset(userId, {
    rulesetId: coreId,
    ancestorRulesetIds: [coreId],
    ...options,
  });

  // Copy ruleset-level properties (e.g., RULESET_SKILL_POINT_ABILITY_ID)
  const sourceProperties = await Properties.findMany(db, {
    entityIds: [coreId],
    entityType: "rulesets",
  });
  if (sourceProperties.length > 0) {
    await Properties.createMany(
      db,
      sourceProperties.map((p) => ({
        ...p,
        id: undefined,
        entityId: ruleset.id,
      })),
    );
  }

  return ruleset;
}

/** A seeded fork that also uses every extension shipped with the seeded base ruleset. */
export async function createSeededTestRulesetWithExtensions(userId: string) {
  const fork = await createSeededTestRuleset(userId);
  const links = await db
    .select({ id: rulesetExtensionsInRules.extensionId })
    .from(rulesetExtensionsInRules)
    .where(eq(rulesetExtensionsInRules.rulesetId, fork.rulesetId!));
  const [ruleset] = await Rulesets.update(db, { extensionRulesetIds: links.map((link) => link.id) }, { id: fork.id });
  RulesetCache.invalidate(fork.id);
  return ruleset;
}

/**
 * An empty private D&D 3.5 draft ruleset owned by `userId` (`null` for a
 * system ruleset). Pass `rulesetId` and `ancestorRulesetIds` to make it a
 * fork. For one that already has the seeded content, use `createSeededTestRuleset`.
 */
export async function createTestRuleset(
  userId: string | null,
  values: Partial<InferInsertModel<typeof rulesetsInRules>> = {},
) {
  const [ruleset] = await Rulesets.create(db, {
    name: `Test Ruleset ${uniqueId()}`,
    description: "Test ruleset description",
    private: true,
    baseRules: "Dungeons & Dragons: 3.5",
    userId,
    ...values,
  });
  return ruleset;
}

/** A new user with an empty ruleset of their own, holding aptitudes of these names: their ids, in that order. */
export async function createTestUserAndRuleset(aptitudeNames: string[] = []) {
  const { user, session } = await createTestUser();
  const ruleset = await createTestRuleset(user.id);
  const aptitudes = await insertRows(
    aptitudesInRules,
    aptitudeNames.map((name) => ({ name, rulesetId: ruleset.id })),
  );
  return { user, session, ruleset, aptitudeIds: aptitudes.map((a) => a.id) };
}

/** A change to `ruleset`'s entities, as a service makes in its scope, outside one. */
export async function editRuleset(ruleset: {
  id: string;
  extensionRulesetIds: string[];
  ancestorRulesetIds: string[];
}) {
  return new RulesetEdit(ruleset, await RulesetCache.getCowData(ruleset));
}

/** A new aptitude of the ruleset, created through the API as the seed user. */
export async function postAptitude(rulesetId: string) {
  return await expectOk(
    api.api.rulesets[":id"].aptitudes.$post({ param: { id: rulesetId }, json: { name: `Aptitude ${uniqueId()}` } }),
  );
}
