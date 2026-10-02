import { and, eq, type InferInsertModel, type InferSelectModel, isNull, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { JobHelpers } from "graphile-worker";

import { coreRulesetId } from "@/database/packages/dnd35/seed/context.ts";
import { getSeedContext, SEED_USER_ID, type SeedContext } from "@/database/seeds/helpers.ts";
import {
  type charactersInCharacter,
  klassLevelsInRules,
  rulesetExtensionsInRules,
  type rulesetsInRules,
} from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import {
  Attachments,
  Blobs,
  Campaigns,
  CharacterContributors,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  Contributors,
  Exports,
  Klasses,
  KlassLevels,
  Players,
  Properties,
  Rulesets,
  Users,
} from "@/server/repositories/index.ts";
import { CharacterLevelsMethods } from "@/server/services/characters/CharacterLevelsService.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

/** An id no row has: for "not found" cases. */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** A short random suffix that keeps names and emails unique between tests. */
export function uniqueId() {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * A session for `userId` that services accept. It isn't stored, so it can't
 * sign in an API request: use `signedInApi` from `tests/api.ts` for that.
 */
export function makeSession(userId: string = SEED_USER_ID): Session {
  const now = new Date().toISOString();
  return {
    id: `session-${uniqueId()}`,
    userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

let seedContext: Promise<SeedContext> | undefined;

/** Ids of the seeded D&D 3.5 content, by name. Loaded once per test process. */
export function getSeedCtx() {
  seedContext ??= getSeedContext(db);
  return seedContext;
}

/** Inserts rows straight into `table` and returns them: test data set up in bulk, which the app writes one at a time. */
export async function insertRows<T extends PgTable>(
  table: T,
  rows: InferInsertModel<T>[],
): Promise<InferSelectModel<T>[]> {
  if (rows.length === 0) return [];
  return (await db.insert(table).values(rows).returning()) as InferSelectModel<T>[];
}

/** A new user and a session for them. `prefix` starts the username and email. */
export async function createTestUser(prefix = "testuser") {
  const id = uniqueId();
  const [user] = await Users.create(db, {
    username: `${prefix}-${id}`,
    emailAddress: `${prefix}-${id}@example.com`,
    password: "password1234",
  });
  return { user, session: makeSession(user.id) };
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

/** A new user with an empty ruleset of their own. */
export async function createTestUserAndRuleset() {
  const { user, session } = await createTestUser();
  const ruleset = await createTestRuleset(user.id);
  return { user, session, ruleset };
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
  const coreId = await coreRulesetId(db, "A seeded test ruleset");

  const ruleset = await createTestRuleset(userId, {
    rulesetId: coreId,
    ancestorRulesetIds: [coreId],
    ...options,
  });

  // Copy ruleset-level properties (e.g., RULESET_SKILL_POINT_ABILITY_ID)
  const sourceProperties = await Properties.findManyByEntity(db, {
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

const writtenSeededRulesets = new Set<string>();

/**
 * Drops a seeded ruleset's cached rules after the test wrote rows straight into it, so what it reads next
 * sees them. The cache outlives the test's rollback, so the setup drops them again once the test ends.
 * A fork goes away with the rollback: after writing into one, `invalidateRuleset` is enough.
 */
export function invalidateSeededRuleset(rulesetId: string) {
  writtenSeededRulesets.add(rulesetId);
  invalidateRuleset(rulesetId);
}

/** Drops the rules of the seeded rulesets the test wrote to, now that the rollback undid its rows. */
export function forgetSeededRulesetWrites() {
  for (const rulesetId of writtenSeededRulesets) invalidateRuleset(rulesetId);
  writtenSeededRulesets.clear();
}

/** A seeded fork that also uses every extension shipped with the seeded base ruleset. */
export async function createSeededTestRulesetWithExtensions(userId: string) {
  const fork = await createSeededTestRuleset(userId);
  const links = await db
    .select({ id: rulesetExtensionsInRules.extensionId })
    .from(rulesetExtensionsInRules)
    .where(eq(rulesetExtensionsInRules.rulesetId, fork.rulesetId!));
  const [ruleset] = await Rulesets.update(db, { extensionRulesetIds: links.map((link) => link.id) }, { id: fork.id });
  invalidateRuleset(fork.id);
  return ruleset;
}

/** A campaign on the seeded ruleset (or `rulesetId`) with `userId` as its Game Master. */
export async function createTestCampaign(userId: string, rulesetId?: string) {
  const [campaign] = await Campaigns.create(db, {
    name: `Test Campaign ${uniqueId()}`,
    description: "Test campaign",
    rulesetId: rulesetId ?? (await getSeedCtx()).rulesetId,
  });
  const [player] = await Players.create(db, { userId, campaignId: campaign.id, role: "Game Master" });
  return { campaign, player };
}

/**
 * A human character of `userId`'s on the seeded ruleset, written straight to
 * the database: no abilities, levels or activity. Create one through
 * `CharactersMethods.createCharacter` when the test needs those.
 */
export async function createTestCharacter(
  userId: string,
  values: Partial<InferInsertModel<typeof charactersInCharacter>> = {},
) {
  const ctx = await getSeedCtx();
  const [character] = await Characters.create(db, {
    userId,
    rulesetId: ctx.rulesetId,
    raceId: ctx.raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    xp: 0,
    alignment: "Neutral Good",
    age: 25,
    gender: "Male",
    height: "180",
    weight: "75",
    ...values,
  });
  return character;
}

/** A new class of the ruleset, with its first level. */
export async function createTestKlassLevel(rulesetId: string) {
  const [klass] = await Klasses.create(db, { name: `Test Class ${uniqueId()}`, rulesetId, hd: 8 });
  const [klassLevel] = await KlassLevels.create(db, { klassId: klass.id, level: 1 });
  return { klass, klassLevel };
}

/** A class's level `level`. */
export async function findKlassLevel(klassId: string, level: number) {
  return await db.query.klassLevelsInRules.findFirst({
    where: and(
      eq(klassLevelsInRules.klassId, klassId),
      eq(klassLevelsInRules.level, level),
      isNull(klassLevelsInRules.deletedAt),
    ),
  });
}

type LevelPicks = {
  feats?: { featId: string; aptitudeId: string }[];
  powers?: { powerId: string; aptitudeId: string }[];
  skills?: { skillId: string; rank: number }[];
};

/** Gives a character a level in a class level, with these picks, straight in the database: no level-up rule applies. */
export async function addCharacterLevel(characterId: string, klassLevelId: string, picks: LevelPicks = {}) {
  const [level] = await CharacterLevels.create(db, { characterId, klassLevelId, hp: 1 });
  const characterLevelId = level.id;
  await CharacterLevelFeats.create(
    db,
    (picks.feats ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  await CharacterLevelPowers.create(
    db,
    (picks.powers ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  await CharacterLevelSkills.create(
    db,
    (picks.skills ?? []).map((pick) => ({ ...pick, characterLevelId })),
  );
  return level;
}

type Contributor = { id: string; emailAddress: string };

/** Makes `user` an active contributor of a ruleset, as if they accepted an invite from `invitedBy`. */
export async function addRulesetContributor(
  rulesetId: string,
  user: Contributor,
  invitedBy: string,
  role: ContributorRole = "Editor",
) {
  const [invite] = await Contributors.create(db, {
    rulesetId,
    userId: user.id,
    email: user.emailAddress,
    role,
    invitedBy,
  });
  const [contributor] = await Contributors.update(db, { status: "Active" }, { id: invite.id });
  return contributor;
}

/** Makes `user` an active contributor of a character, as if they accepted an invite from `invitedBy`. */
export async function addCharacterContributor(characterId: string, user: Contributor, invitedBy: string) {
  const [invite] = await CharacterContributors.create(db, {
    characterId,
    userId: user.id,
    email: user.emailAddress,
    role: "Editor",
    invitedBy,
  });
  const [contributor] = await CharacterContributors.update(db, { status: "Active" }, { id: invite.id });
  return contributor;
}

/** A PDF export of `userId`'s, valid for an hour unless `expiresAt` says otherwise. */
export async function createExport(userId: string, expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()) {
  const [record] = await Exports.create(db, {
    userId,
    type: "pdf",
    mimeType: "application/pdf",
    fileName: "test-sheet.pdf",
    data: Buffer.from("fake pdf content"),
    expiresAt,
  });
  return record;
}

/** An image attached to a user (its avatar) or a character (its portrait), written straight to the database. */
export async function createTestAttachment(recordType: "User" | "Character", recordId: string) {
  const [blob] = await Blobs.create(db, {
    key: `blobs/${uniqueId()}/image.png`,
    filename: "image.png",
    contentType: "image/png",
    byteSize: 100,
    attachedAt: new Date().toISOString(),
  });
  const name = recordType === "User" ? "avatar" : "portrait";
  const [attachment] = await Attachments.create(db, { recordType, recordId, name, blobId: blob.id });
  return attachment;
}

/** Worker job helpers with a silent logger, for running a task directly. */
export const silentJobHelpers = {
  logger: { info() {}, warn() {}, error() {}, debug() {} },
} as unknown as JobHelpers;

/** The jobs queued whose payload's `key` is `value`: their task, queue and payload. */
export async function queuedJobs(key: string, value: string) {
  const jobs = await db.execute<{ task: string; queue: string | null; payload: Record<string, unknown> }>(sql`
    SELECT t.identifier AS task, q.queue_name AS queue, j.payload
    FROM graphile_worker._private_jobs j
    JOIN graphile_worker._private_tasks t ON t.id = j.task_id
    LEFT JOIN graphile_worker._private_job_queues q ON q.id = j.job_queue_id
    WHERE j.payload->>${key} = ${value}
  `);
  return jobs.rows;
}

/** The PDF jobs queued for `characterId`: task, queue and payload. */
export async function queuedPdfJobs(characterId: string) {
  return await queuedJobs("characterId", characterId);
}

/**
 * Adds a single level to a character via the batch finalizer. Tests used
 * `finalizeLevelUp` for this before batch became the only flow; this wraps
 * `finalizeLevelUp` with one level so call sites stay readable.
 */
export async function addOneLevel(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  hp: number,
  abilityId: string | null,
  skills: Record<string, number> = {},
  feats: Record<string, string[]> = {},
  powers: Record<string, string[]> = {},
  force = false,
) {
  const createdLevels = await CharacterLevelsMethods.finalizeLevelUp(
    session,
    characterId,
    [{ klassId, level, hp, abilityId }],
    skills,
    feats,
    powers,
    force,
  );
  return createdLevels[0];
}
