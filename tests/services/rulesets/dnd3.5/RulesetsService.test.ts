import { describe, expect, test } from "bun:test";

import { DND35_COMPLETE_WARRIOR_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import { starredRulesetsInAccount } from "@/drizzle/schema.ts";
import {
  type Aptitude,
  type Feat,
  type Item,
  type Klass,
  type KlassLevel,
  type Race,
  type RulesetAbility,
  type Skill,
} from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  STALE_ENTITY_MESSAGE,
  UnprocessableEntityError,
} from "@/server/errors/index.ts";
import {
  Entities,
  EntityLinks,
  EntitySnapshots,
  Modifiers,
  Players,
  Requirements,
  Rulesets,
  StarredRulesets,
} from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { RulesetSettingsService } from "@/server/services/rulesets/settings/index.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { addRulesetContributor } from "@/tests/support/contributors.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestClassLevel, findPicks } from "@/tests/support/dnd3.5/levels.ts";
import { addClassSkills, addLists, findLists } from "@/tests/support/dnd3.5/links.ts";
import { findFormValues, writeFieldValues } from "@/tests/support/ownerValues.ts";
import {
  bumpContentVersion,
  copyEntity,
  createTestRuleset,
  ownerSessionOf,
  readView,
  sourcesOf,
  subscribeTestRuleset,
} from "@/tests/support/rulesets.ts";
import { findSeededRuleset, getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import {
  CLASS_HD,
  FEAT_FAMILY,
  ITEM_IS_TEMPLATE,
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_SIZE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

type RulesetValues = NonNullable<Parameters<typeof createTestRuleset>[1]>;
const firstPage = { limit: 100, page: 1 };
const NAME_TAKEN = new ConflictError("A ruleset with this name already exists");

/** A fork of `parent` for `session`'s user. */
function fork(
  session: Session,
  parent: { id: string },
  values: { description?: string; name?: string; private?: boolean } = {},
) {
  return RulesetsService.forkRuleset(session, parent.id, { name: `Fork ${uniqueId()}`, private: false, ...values });
}

/** A race, a class, a skill and a feat: what a ruleset needs to be published. */
async function addPlayableContent(rulesetId: string) {
  const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
    name: "Strength",
    description: "Strength",
    rulesetId,
  });
  const [race] = await Entities.create<Race>(db, "races", {
    name: "Human",
    rulesetId,
    fields: { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 },
  });
  const [klass] = await Entities.create<Klass>(db, "classes", {
    name: "Fighter",
    rulesetId,
    fields: { [CLASS_HD]: 10 },
  });
  const [skill] = await Entities.create<Skill>(db, "skills", {
    name: "Climb",
    rulesetId,
    links: { keyAbility: ability.id },
  });
  const [feat] = await Entities.create<Feat>(db, "feats", { name: "Toughness", rulesetId });
  return { race, klass, skill, feat };
}

/** A fork of a published base, owned by `userId`. */
async function createFork(userId: string, values: RulesetValues = {}) {
  const base = await createTestRuleset(null, { private: false, status: "Published" });
  return await createTestRuleset(userId, { rulesetId: base.id, ...values });
}

/** A published ruleset of `userId` (a system one when null), with a template item so forking it doesn't seed the engine's. */
async function createParent(userId: string | null = null, values: RulesetValues = {}) {
  const ruleset = await createTestRuleset(userId, { private: false, status: "Published", ...values });
  await Entities.create<Item>(db, "items", {
    name: "Template",
    rulesetId: ruleset.id,
    fields: { [ITEM_IS_TEMPLATE]: true },
  });
  return ruleset;
}

/** A fork of another user's ruleset with three feats, and an aptitude that links one of them. */
async function setupChanges(values: { private?: boolean } = {}) {
  const { user: owner } = await createTestUser();
  const { user, session } = await createTestUser();
  const parent = await createParent(owner.id);
  const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", { name: "General", rulesetId: parent.id });
  const [modified, deleted, untouched] = await Entities.createMany<Feat>(
    db,
    "feats",
    ["Power Attack", "Cleave", "Dodge"].map((name) => ({ name, rulesetId: parent.id })),
  );
  await addLists(db, "feats", modified.id, [{ toId: aptitude.id }]);
  const forked = await fork(session, parent, values);
  return { user, session, owner, parent, fork: forked, aptitude, modified, deleted, untouched };
}

/**
 * The user's view of a dozen rulesets: owned, others', system, contributed to, reached through a campaign, and a deleted
 * account's.
 */
async function setupListing() {
  const { user, session } = await createTestUser();
  const { user: other } = await createTestUser();
  const { user: leaver } = await createTestUser();
  const base = await createTestRuleset(null, { private: false, status: "Published" });
  const fork = { rulesetId: base.id };
  const published = { private: false, status: "Published" } as const;
  const rulesets = {
    base,
    systemExtension: await createTestRuleset(null, { ...fork, ...published, kind: "extension" }),
    ownDraft: await createTestRuleset(user.id, fork),
    ownPublic: await createTestRuleset(user.id, { ...fork, ...published }),
    ownArchived: await createTestRuleset(user.id, { ...fork, status: "Archived" }),
    othersDraft: await createTestRuleset(other.id, { ...fork, private: false }),
    othersPublished: await createTestRuleset(other.id, { ...fork, ...published }),
    othersPrivate: await createTestRuleset(other.id, { ...fork, status: "Published" }),
    othersExtension: await createTestRuleset(other.id, { ...fork, ...published, kind: "extension" }),
    contributedDraft: await createTestRuleset(other.id, fork),
    contributedPublished: await createTestRuleset(other.id, { ...fork, status: "Published" }),
    campaign: await createTestRuleset(other.id, fork),
    orphanedPublic: await createTestRuleset(leaver.id, { ...fork, ...published }),
    orphanedExtension: await createTestRuleset(leaver.id, { ...fork, status: "Published", kind: "extension" }),
  };
  // As deleting the account leaves them: no owner, and not the system's
  await Rulesets.orphan(db, { userId: leaver.id });
  await addRulesetContributor(rulesets.contributedDraft.id, user, other.id);
  await addRulesetContributor(rulesets.contributedPublished.id, user, other.id);
  const { campaign } = await createTestCampaign(other.id, rulesets.campaign.id);
  await Players.create(db, { userId: user.id, campaignId: campaign.id, role: "Player Character" });
  await insertRows(starredRulesetsInAccount, [{ userId: user.id, rulesetId: rulesets.othersExtension.id }]);
  return { session, rulesets };
}

describe("RulesetsService", () => {
  describe("listing", () => {
    type Scope = Parameters<typeof RulesetsService.getRulesets>[1]["scope"];
    type Name = keyof Awaited<ReturnType<typeof setupListing>>["rulesets"];

    // docs/access.md describes each scope.
    const SCOPES: [Scope, Name[]][] = [
      [undefined, ["base", "ownDraft", "ownPublic", "contributedDraft", "contributedPublished", "campaign"]],
      ["base", ["base"]],
      ["systems", ["base", "systemExtension"]],
      ["extensions", ["systemExtension", "othersExtension"]],
      ["community", ["ownPublic", "othersPublished", "orphanedPublic"]],
      [
        "published",
        [
          "base",
          "ownDraft",
          "ownPublic",
          "othersPublished",
          "contributedDraft",
          "contributedPublished",
          "orphanedPublic",
        ],
      ],
      ["forked", ["ownDraft", "ownPublic"]],
      ["createdByMe", ["ownDraft", "ownPublic", "contributedDraft", "contributedPublished"]],
      ["createdByMePrivate", ["ownDraft"]],
      ["contributedTo", ["contributedDraft", "contributedPublished"]],
      ["myDrafts", ["ownDraft", "contributedDraft"]],
      ["archived", ["ownArchived"]],
      ["campaignAccessible", ["campaign"]],
      ["starred", ["othersExtension"]],
    ];

    test("lists what each scope covers", async () => {
      const { session, rulesets } = await setupListing();
      const nameById = new Map(Object.entries(rulesets).map(([name, ruleset]) => [ruleset.id, name]));
      for (const [scope, expected] of SCOPES) {
        const { items } = await RulesetsService.getRulesets(session, { scope }, firstPage);
        const listed = items.flatMap((r) => nameById.get(r.id) ?? []).sort();
        expect({ scope, listed }).toEqual({ scope, listed: [...expected].sort() });
      }
    });

    test("tells each ruleset's parent, stars and whether it can be starred", async () => {
      const { session, rulesets } = await setupListing();
      const { items } = await RulesetsService.getRulesets(session, { scope: "extensions" }, firstPage);
      expect(items.find((r) => r.id === rulesets.othersExtension.id)).toMatchObject({
        rulesetName: rulesets.base.name,
        isStarred: true,
        starCount: 1,
        isStarrable: true,
      });
      expect(items.find((r) => r.id === rulesets.systemExtension.id)).toMatchObject({ isStarred: false, starCount: 0 });
    });

    test("searches by name, sorts and pages", async () => {
      const { user, session } = await createTestUser();
      const names = ["Alpha Search", "Beta Search", "Gamma Search"].map((name) => `${name} ${uniqueId()}`);
      // Rows made in one transaction share a creation time: give them their own.
      for (const [day, name] of names.entries())
        await createTestRuleset(user.id, { name, createdAt: `2026-01-0${day + 1}T00:00:00Z` });

      const search = (orderDir: "asc" | "desc", page = 1, limit = 3) =>
        RulesetsService.getRulesets(session, { search: "Search", orderBy: "createdAt", orderDir }, { limit, page });
      expect((await search("asc")).items.map((r) => r.name)).toEqual(names);
      expect((await search("desc")).items.map((r) => r.name)).toEqual([...names].reverse());
      expect(await search("asc", 2, 2)).toMatchObject({ items: [{ name: names[2] }], page: 2 });
    });
  });

  test("reads a ruleset with its parent's name, stars and the reader's role", async () => {
    const { user: owner } = await createTestUser();
    const { user, session } = await createTestUser();
    const parent = await createTestRuleset(null, { private: false, status: "Published" });
    const ruleset = await createTestRuleset(owner.id, {
      rulesetId: parent.id,
      private: false,
      status: "Published",
      kind: "extension",
    });
    await addRulesetContributor(ruleset.id, user, owner.id, "Admin");
    await RulesetsService.starRuleset(session, ruleset.id);

    expect(await RulesetsService.getRuleset(session, ruleset.id)).toMatchObject({
      id: ruleset.id,
      rulesetName: parent.name,
      isStarred: true,
      starCount: 1,
      isStarrable: true,
      contributorRole: "Admin",
    });
    expect(RulesetsService.getRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
  });

  test("reads a deleted account's private ruleset to its contributors, who may build on it", async () => {
    const { user: leaver } = await createTestUser();
    const { user: contributor, session } = await createTestUser();
    const { session: stranger } = await createTestUser();
    const base = await createTestRuleset(null, { private: false, status: "Published" });
    const ruleset = await createTestRuleset(leaver.id, { rulesetId: base.id });
    await addRulesetContributor(ruleset.id, contributor, leaver.id);
    const [orphaned] = await Rulesets.orphan(db, { userId: leaver.id });

    const { items } = await RulesetsService.getRulesets(session, { scope: "contributedTo" }, firstPage);
    expect(items.map((r) => r.id)).toEqual([ruleset.id]);
    expect(await RulesetsService.getRuleset(session, ruleset.id)).toMatchObject({
      id: ruleset.id,
      contributorRole: "Editor",
    });
    expect((await RulesetsPolicy.for(db, session, orphaned)).canCreateCharacter()).toBe(true);
    expect(RulesetsService.getRuleset(stranger, ruleset.id)).rejects.toThrow(NotFoundError);
  });

  describe("answers what the reader may do, as the policy decides it", () => {
    const NONE = {
      canBeExtension: false,
      canEditEntities: false,
      canEditRuleset: false,
      canFork: false,
      canInviteContributors: false,
      canLeave: false,
      canManageAdminContributors: false,
      canManageContributors: false,
      canPublish: false,
      canReadContributors: false,
      canSubscribeExtensions: false,
      canUnarchive: false,
      canUnsubscribeExtensions: false,
      canUpdateContributorRoles: false,
      canViewChanges: false,
    };
    const OWNER = {
      ...NONE,
      canEditEntities: true,
      canEditRuleset: true,
      canInviteContributors: true,
      canManageAdminContributors: true,
      canManageContributors: true,
      canReadContributors: true,
      canUpdateContributorRoles: true,
      canViewChanges: true,
    };

    test("its owner edits everything, publishes a draft alone, and subscribes a fork to extensions and unsubscribes it", async () => {
      const { user, session } = await createTestUser();
      const draft = await createTestRuleset(user.id, { status: "Draft" });
      const published = await createTestRuleset(user.id, { status: "Published" });
      const fork = await createFork(user.id);

      expect((await RulesetsService.getRuleset(session, draft.id)).permissions).toEqual({ ...OWNER, canPublish: true });
      // A published ruleset that isn't a fork is forked, by anyone
      expect((await RulesetsService.getRuleset(session, published.id)).permissions).toEqual({
        ...OWNER,
        canFork: true,
      });
      expect((await RulesetsService.getRuleset(session, fork.id)).permissions).toEqual({
        ...OWNER,
        canBeExtension: true,
        canPublish: true,
        canSubscribeExtensions: true,
        canUnsubscribeExtensions: true,
      });
    });

    test("an Admin manages Editors and Viewers, not Admins; an Editor edits its entities; a stranger does nothing", async () => {
      const { user: owner } = await createTestUser();
      const { user: admin, session: adminSession } = await createTestUser();
      const { user: editor, session } = await createTestUser();
      const { session: stranger } = await createTestUser();
      const ruleset = await createTestRuleset(owner.id, { private: false, status: "Published" });
      await addRulesetContributor(ruleset.id, admin, owner.id, "Admin");
      await addRulesetContributor(ruleset.id, editor, owner.id, "Editor");

      expect((await RulesetsService.getRuleset(adminSession, ruleset.id)).permissions).toEqual({
        ...OWNER,
        canFork: true,
        canLeave: true,
        canManageAdminContributors: false,
      });
      expect((await RulesetsService.getRuleset(session, ruleset.id)).permissions).toEqual({
        ...NONE,
        canEditEntities: true,
        canFork: true,
        canLeave: true,
        canReadContributors: true,
        canViewChanges: true,
      });
      // A public ruleset's changes are anyone's to see
      expect((await RulesetsService.getRuleset(stranger, ruleset.id)).permissions).toEqual({
        ...NONE,
        canFork: true,
        canViewChanges: true,
      });
    });

    test("an archived ruleset is read-only but unarchived: contributors are still managed, never invited nor their roles changed", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Archived" });
      const extension = await createTestRuleset(null, { kind: "extension" });
      const fork = await createFork(user.id, { status: "Archived" });
      await subscribeTestRuleset(fork.id, [extension.id]);
      const archived = {
        ...NONE,
        canManageAdminContributors: true,
        canManageContributors: true,
        canReadContributors: true,
        canUnarchive: true,
        canViewChanges: true,
      };

      expect((await RulesetsService.getRuleset(session, ruleset.id)).permissions).toEqual(archived);
      // An archived fork keeps its extensions: none is unsubscribed
      expect((await RulesetsService.getRuleset(session, fork.id)).permissions).toEqual(archived);
    });

    test("a fork other rulesets subscribe to takes no extensions, and one with extensions can't be one", async () => {
      const { user, session } = await createTestUser();
      const { user: subscriber } = await createTestUser();
      const used = await createFork(user.id, { private: false, status: "Published" });
      await subscribeTestRuleset((await createFork(subscriber.id)).id, [used.id]);
      const extension = await createTestRuleset(null, { rulesetId: used.rulesetId, kind: "extension" });
      const subscribing = await createFork(user.id);
      await subscribeTestRuleset(subscribing.id, [extension.id]);

      expect((await RulesetsService.getRuleset(session, used.id)).permissions).toMatchObject({
        canBeExtension: true,
        canSubscribeExtensions: false,
      });
      expect((await RulesetsService.getRuleset(session, subscribing.id)).permissions).toMatchObject({
        canBeExtension: false,
        canSubscribeExtensions: true,
      });
    });

    test("a campaign's Game Master reads a private fork it plays on, but not its local changes", async () => {
      const { user: owner } = await createTestUser();
      const { user: gameMaster, session } = await createTestUser();
      const fork = await createFork(owner.id, { status: "Published" });
      await createTestCampaign(gameMaster.id, fork.id);

      expect((await RulesetsService.getRuleset(session, fork.id)).permissions).toEqual({
        ...NONE,
        canBeExtension: true,
      });
      expect(RulesetChangesService.getChanges(session, fork.id)).rejects.toThrow(ForbiddenError);
    });

    test("a deleted account's ruleset is frozen: its Admin, as its other contributors, may only leave it", async () => {
      const { user: leaver } = await createTestUser();
      const { user: admin, session } = await createTestUser();
      const ruleset = await createFork(leaver.id);
      await addRulesetContributor(ruleset.id, admin, leaver.id, "Admin");
      await Rulesets.orphan(db, { userId: leaver.id });

      expect((await RulesetsService.getRuleset(session, ruleset.id)).permissions).toEqual({
        ...NONE,
        canBeExtension: true,
        canLeave: true,
        canReadContributors: true,
        canViewChanges: true,
      });
      expect(RulesetsService.updateRuleset(session, ruleset.id, { name: "Renamed", description: "" })).rejects.toThrow(
        "Cannot edit a ruleset without an owner",
      );
    });
  });

  describe("forking", () => {
    test("makes the user a ruleset that inherits the parent's content without copying it", async () => {
      const { user: owner } = await createTestUser();
      const { user, session } = await createTestUser();
      const extension = await createTestRuleset(null, { private: false, status: "Published", kind: "extension" });
      const parent = await createParent(owner.id, { description: "Parent description" });
      await subscribeTestRuleset(parent.id, [extension.id]);
      const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", { name: "General", rulesetId: parent.id });
      const feat = await EntitiesService.createEntity({ ...session, userId: owner.id }, parent.id, "feats", {
        name: "Toughness",
        links: { listedIn: [{ toId: aptitude.id }] },
      });
      const [intelligence] = await Entities.create<RulesetAbility>(db, "abilities", {
        name: "Intelligence",
        rulesetId: parent.id,
      });
      await writeFieldValues("rulesets", parent.id, [], { skillPointAbility: intelligence.id });

      const created = await fork(session, parent, { name: "My Fork", private: true });
      expect(created).toMatchObject({
        name: "My Fork",
        description: "Parent description",
        private: true,
        status: "Draft",
        userId: user.id,
        rulesetId: parent.id,
        baseRules: parent.baseRules,
      });
      expect((await sourcesOf(created.id)).extensionIds).toEqual([extension.id]);
      expect(
        (await Entities.findPage<Feat>(db, { entityType: "feats", rulesetId: created.id }, firstPage)).items,
      ).toEqual([]);
      expect(await EntitySnapshots.findMany(db, { rulesetId: created.id })).toEqual([]);
      expect(
        await EntitiesService.getEntity(await ownerSessionOf(created.id), created.id, "feats", feat.id),
      ).toMatchObject({
        id: feat.id,
        links: [{ role: "listedIn", toId: aptitude.id }],
      });
      // Its Settings are its chain's: it holds none of its own, and reads its parent's
      expect(await findFormValues("rulesets", created.id)).toEqual({ fields: {}, links: {} });
      expect((await RulesetSettingsService.getSettings(await ownerSessionOf(created.id), created.id)).links).toEqual({
        skillPointAbility: intelligence.id,
      });

      expect((await fork(session, parent, { description: "Mine" })).description).toBe("Mine");
    });

    test("gives the fork no template items of its own: it reads its base's through its chain", async () => {
      const { session } = await createTestUser();
      const parent = await createParent();
      expect(
        await Entities.findList<Item>(db, {
          entityType: "items",
          rulesetId: (await fork(session, parent)).id,
          fields: { [ITEM_IS_TEMPLATE]: true },
          order: "name",
        }),
      ).toEqual([]);
    });

    test("refuses a fork of a fork, of a draft, of a missing ruleset, or under a taken name", async () => {
      const { user, session } = await createTestUser();
      const parent = await createParent();
      const first = await fork(session, parent);
      await Rulesets.update(db, { status: "Published" }, { id: first.id });

      expect(fork(session, first)).rejects.toThrow(UnprocessableEntityError);
      expect(fork(session, await createTestRuleset(null, { private: false }))).rejects.toThrow(
        UnprocessableEntityError,
      );
      expect(fork(session, { id: NIL_UUID })).rejects.toThrow(NotFoundError);
      expect(fork(session, parent, { name: (await createTestRuleset(user.id)).name })).rejects.toEqual(NAME_TAKEN);
    });

    test("lets an ordinary account override more than 25 inherited entities", async () => {
      const { session } = await createTestUser();
      const { rulesetId } = await getSeedCtx();
      const created = await fork(session, { id: rulesetId }, { private: true });
      const feats = await Entities.findPage<Feat>(db, { entityType: "feats", rulesetId }, { limit: 26, page: 1 });
      for (const feat of feats.items) expect((await copyEntity(db, "feats", feat.id, created)).id).not.toBe(feat.id);

      expect(await EntitySnapshots.findMany(db, { rulesetId: created.id })).toHaveLength(26);
    });
  });

  describe("archiving", () => {
    test("archives a ruleset in use, leaving its content live, and unarchives it as a draft", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Published" });
      const { feat, race } = await addPlayableContent(ruleset.id);
      await writeFieldValues("feats", feat.id, [[FEAT_FAMILY, "combat"]]);
      await createTestCampaign(user.id, ruleset.id);
      await createTestCharacter(user.id, { rulesetId: ruleset.id, links: { race: race.id } });

      expect(await RulesetsService.archiveRuleset(session, ruleset.id)).toMatchObject({ status: "Archived" });
      expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toMatchObject({ id: feat.id });
      expect(await findFormValues("feats", feat.id)).toEqual({ fields: { [FEAT_FAMILY]: ["combat"] }, links: {} });

      expect(await RulesetsService.unarchiveRuleset(session, ruleset.id)).toMatchObject({ status: "Draft" });
    });

    test("refuses another user's ruleset, a base, a missing one, and unarchiving one that isn't archived", async () => {
      const { user, session } = await createTestUser();
      const { session: other } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const base = await createTestRuleset(null, { private: false, status: "Published" });

      // Another user's private ruleset isn't revealed to them
      expect(RulesetsService.archiveRuleset(other, ruleset.id)).rejects.toThrow(NotFoundError);
      expect(RulesetsService.archiveRuleset(session, base.id)).rejects.toThrow(ForbiddenError);
      expect(RulesetsService.archiveRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
      expect(RulesetsService.unarchiveRuleset(session, ruleset.id)).rejects.toThrow(ForbiddenError);
      expect(RulesetsService.unarchiveRuleset(session, base.id)).rejects.toThrow(ForbiddenError);
      expect(RulesetsService.unarchiveRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
      await RulesetsService.archiveRuleset(session, ruleset.id);
      expect(RulesetsService.unarchiveRuleset(other, ruleset.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("publishing", () => {
    test("publishes a draft with a race, a class, a skill and a feat", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      await addPlayableContent(ruleset.id);
      expect(await RulesetsService.publishRuleset(session, ruleset.id)).toMatchObject({
        id: ruleset.id,
        status: "Published",
        kind: "ruleset",
      });
    });

    test("names the kinds of content still missing, not counting deleted rows", async () => {
      const { user, session } = await createTestUser();
      const empty = await createTestRuleset(user.id);
      expect(RulesetsService.publishRuleset(session, empty.id)).rejects.toMatchObject({
        refusal: "unprocessable",
        message: "Ruleset requires at least one of each: race, class, skill, feat",
      });

      const partial = await createTestRuleset(user.id);
      const { race, klass } = await addPlayableContent(partial.id);
      await Entities.delete<Race>(db, { entityType: "races", id: race.id });
      await Entities.delete<Klass>(db, { entityType: "classes", id: klass.id });
      expect(RulesetsService.publishRuleset(session, partial.id)).rejects.toMatchObject({
        refusal: "unprocessable",
        message: "Ruleset requires at least one of each: race, class",
      });
    });

    test("publishes a fork as an extension without playable content, unless it isn't a fork or uses extensions itself", async () => {
      const { user, session } = await createTestUser();
      const { rulesetId } = await getSeedCtx();
      const extension = await fork(session, { id: rulesetId });
      expect(await RulesetsService.publishRuleset(session, extension.id, { kind: "extension" })).toMatchObject({
        kind: "extension",
        status: "Published",
      });

      expect(
        RulesetsService.publishRuleset(session, (await createTestRuleset(user.id)).id, { kind: "extension" }),
      ).rejects.toThrow(UnprocessableEntityError);
      const host = await fork(session, { id: rulesetId });
      const seedExtension = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
      await RulesetExtensionsService.subscribeExtension(session, host.id, [seedExtension.id]);
      expect(RulesetsService.publishRuleset(session, host.id, { kind: "extension" })).rejects.toThrow(
        "A ruleset that subscribes to extensions cannot itself be an extension",
      );
    });

    test("refuses another user's ruleset, a base, a published or archived one, and a missing one", async () => {
      const { user, session } = await createTestUser();
      const { session: other } = await createTestUser();
      const draft = await createTestRuleset(user.id);
      await addPlayableContent(draft.id);

      // Another user's private ruleset isn't revealed to them
      expect(RulesetsService.publishRuleset(other, draft.id)).rejects.toThrow(NotFoundError);
      const base = await createTestRuleset(null, { private: false });
      expect(RulesetsService.publishRuleset(session, base.id)).rejects.toThrow(ForbiddenError);
      expect(
        RulesetsService.publishRuleset(session, (await createTestRuleset(user.id, { status: "Published" })).id),
      ).rejects.toThrow(UnprocessableEntityError);
      expect(
        RulesetsService.publishRuleset(session, (await createTestRuleset(user.id, { status: "Archived" })).id),
      ).rejects.toThrow(UnprocessableEntityError);
      expect(RulesetsService.publishRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("updating", () => {
    test("changes the name, the description and makes a private ruleset public, but never the reverse", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const update = { name: `Renamed ${uniqueId()}`, description: "Updated", private: false };
      expect(await RulesetsService.updateRuleset(session, ruleset.id, update)).toMatchObject(update);
      expect(RulesetsService.updateRuleset(session, ruleset.id, { ...update, private: true })).rejects.toThrow(
        ForbiddenError,
      );
    });

    test("makes only a fork an extension", async () => {
      const { user, session } = await createTestUser();
      const base = await createParent();
      const forked = await fork(session, base);
      const update = (id: string, name: string) =>
        RulesetsService.updateRuleset(session, id, { name, description: "", kind: "extension" });
      expect(await update(forked.id, forked.name)).toMatchObject({ kind: "extension" });
      const standalone = await createTestRuleset(user.id);
      expect(update(standalone.id, standalone.name)).rejects.toThrow(UnprocessableEntityError);
    });

    test("refuses making an extension of a ruleset that subscribes to one, a draft or a published one", async () => {
      const { session } = await createTestUser();
      const { rulesetId } = await getSeedCtx();
      const seedExtension = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
      const [draft, published] = [await fork(session, { id: rulesetId }), await fork(session, { id: rulesetId })];
      for (const host of [draft, published])
        await RulesetExtensionsService.subscribeExtension(session, host.id, [seedExtension.id]);
      await RulesetsService.publishRuleset(session, published.id);
      for (const host of [draft, published]) {
        expect(
          RulesetsService.updateRuleset(session, host.id, { name: host.name, description: "", kind: "extension" }),
        ).rejects.toThrow("A ruleset that subscribes to extensions cannot itself be an extension");
      }
    });

    test("makes a published extension playable only with the content publishing it as a ruleset needs", async () => {
      const { session } = await createTestUser();
      const base = await createParent();
      const [empty, playable] = [await fork(session, base), await fork(session, base)];
      await addPlayableContent(playable.id);
      const update = async ({ id, name }: { id: string; name: string }) => {
        await RulesetsService.publishRuleset(session, id, { kind: "extension" });
        return RulesetsService.updateRuleset(session, id, { name, description: "", kind: "ruleset" });
      };
      expect(await update(playable)).toMatchObject({ kind: "ruleset", status: "Published" });
      expect(update(empty)).rejects.toMatchObject({
        refusal: "unprocessable",
        message: "Ruleset requires at least one of each: race, class, skill, feat",
      });
    });

    test("checks a published extension's switch to a ruleset on its content as committed, not as cached", async () => {
      const { session } = await createTestUser();
      const extension = await fork(session, await createParent());
      await RulesetsService.publishRuleset(session, extension.id, { kind: "extension" });
      // Its view cached empty, then its content written by another process, whose cache never told this one
      await readView(extension.id);
      await addPlayableContent(extension.id);
      await bumpContentVersion(extension.id);
      expect(
        await RulesetsService.updateRuleset(session, extension.id, {
          name: extension.name,
          description: "",
          kind: "ruleset",
        }),
      ).toMatchObject({ kind: "ruleset", status: "Published" });
    });

    test("switches a draft extension back to a ruleset before its content, which publishing checks", async () => {
      const { session } = await createTestUser();
      const draft = await fork(session, await createParent());
      const update = (kind: "extension" | "ruleset") =>
        RulesetsService.updateRuleset(session, draft.id, { name: draft.name, description: "", kind });
      await update("extension");
      expect(await update("ruleset")).toMatchObject({ kind: "ruleset", status: "Draft" });
      expect(RulesetsService.publishRuleset(session, draft.id)).rejects.toMatchObject({ refusal: "unprocessable" });
    });

    test("refuses an edit started from a stale copy", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const edit = (name: string) =>
        RulesetsService.updateRuleset(session, ruleset.id, { name, description: "", updatedAt: ruleset.updatedAt });
      await edit(`First ${uniqueId()}`);
      expect(edit(`Second ${uniqueId()}`)).rejects.toThrow(ConflictError);
    });

    test("refuses a name another ruleset holds, another user's or an archived one's, and keeps its own", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const holders = [
        await createTestRuleset(user.id),
        await createTestRuleset((await createTestUser()).user.id),
        await createTestRuleset(user.id, { status: "Archived" }),
      ];
      const edit = (name: string) =>
        RulesetsService.updateRuleset(session, ruleset.id, { name, description: "Edited" });
      for (const holder of holders) expect(edit(holder.name)).rejects.toEqual(NAME_TAKEN);
      expect(await edit(ruleset.name)).toMatchObject({ name: ruleset.name, description: "Edited" });
    });

    test("tells an edit started from a stale copy it's stale before refusing the name it takes", async () => {
      const { user, session } = await createTestUser();
      const [ruleset, holder] = [await createTestRuleset(user.id), await createTestRuleset(user.id)];
      const edit = (name: string, updatedAt?: string) =>
        RulesetsService.updateRuleset(session, ruleset.id, { name, description: "", updatedAt });
      await edit(`Edited ${uniqueId()}`);
      expect(edit(holder.name, ruleset.updatedAt)).rejects.toEqual(new ConflictError(STALE_ENTITY_MESSAGE));
    });

    test("refuses another user's ruleset, a base, an archived one and a missing one", async () => {
      const { user, session } = await createTestUser();
      const { session: other } = await createTestUser();
      const body = { name: "Updated", description: "Updated" };
      // Another user's private ruleset isn't revealed to them; a public one is refused
      expect(RulesetsService.updateRuleset(other, (await createTestRuleset(user.id)).id, body)).rejects.toThrow(
        NotFoundError,
      );
      const shared = await createTestRuleset(user.id, { private: false });
      expect(RulesetsService.updateRuleset(other, shared.id, body)).rejects.toThrow(ForbiddenError);
      const base = await createTestRuleset(null, { private: false });
      expect(RulesetsService.updateRuleset(session, base.id, body)).rejects.toThrow(ForbiddenError);
      expect(
        RulesetsService.updateRuleset(session, (await createTestRuleset(user.id, { status: "Archived" })).id, body),
      ).rejects.toThrow(UnprocessableEntityError);
      expect(RulesetsService.updateRuleset(session, NIL_UUID, body)).rejects.toThrow(NotFoundError);
    });
  });

  describe("starring", () => {
    test("stars published public bases and extensions, not drafts, private rulesets or forks published as rulesets", async () => {
      const { user, session } = await createTestUser();
      const base = await createTestRuleset(null, { private: false, status: "Published" });
      const fork: RulesetValues = {
        rulesetId: base.id,
        private: false,
        status: "Published",
      };
      const star = async (values: RulesetValues) =>
        RulesetsService.starRuleset(session, (await createTestRuleset(user.id, values)).id);

      await RulesetsService.starRuleset(session, base.id);
      await star({ ...fork, kind: "extension" });
      expect(await StarredRulesets.findMany(db, { userId: user.id })).toHaveLength(2);

      expect(star({ private: false })).rejects.toThrow(ForbiddenError);
      expect(star({ status: "Published" })).rejects.toThrow(ForbiddenError);
      expect(star(fork)).rejects.toThrow(ForbiddenError);
      expect(RulesetsService.starRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
    });

    test("unstars, and unstarring what isn't starred is fine", async () => {
      const { user, session } = await createTestUser();
      const base = await createTestRuleset(null, { private: false, status: "Published" });
      await RulesetsService.starRuleset(session, base.id);
      await RulesetsService.unstarRuleset(session, base.id);
      await RulesetsService.unstarRuleset(session, base.id);
      expect(await StarredRulesets.findMany(db, { userId: user.id })).toEqual([]);
    });
  });

  describe("a fork's changes", () => {
    test("lists the entities it modified, deleted and added, by kind and then by name", async () => {
      const { session, fork, modified, deleted } = await setupChanges();
      expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);

      const copy = await EntitiesService.updateEntity(session, fork.id, "feats", modified.id, {
        name: "Power Attack",
        description: "Changed",
      });
      await EntitiesService.deleteEntity(session, fork.id, "feats", deleted.id);
      const [added] = await Entities.create<Feat>(db, "feats", { name: "Homebrew", rulesetId: fork.id });

      expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([
        { entityType: "feats", status: "deleted", sourceEntityId: deleted.id, name: "Cleave" },
        { entityType: "feats", status: "added", entityId: added.id, name: "Homebrew" },
        {
          entityType: "feats",
          status: "modified",
          sourceEntityId: modified.id,
          entityId: copy.id,
          name: "Power Attack",
        },
      ]);
    });

    test("lists nothing for a snapshot whose copy and source are both gone, which stands for no entity", async () => {
      const { session, fork } = await setupChanges();
      const gone = crypto.randomUUID();
      await EntitySnapshots.create(db, {
        rulesetId: fork.id,
        sourceEntityId: gone,
        forkedEntityId: crypto.randomUUID(),
      });
      expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toMatchObject([{ sourceEntityId: gone }]);
      expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);
    });

    test("lists a copy whose source its extension deleted as its own, which no restore brings back", async () => {
      const { user, session } = await createTestUser();
      const { rulesetId } = await getSeedCtx();
      const extension = await createTestRuleset(user.id, { rulesetId });
      const host = await createTestRuleset(user.id, { rulesetId });
      await subscribeTestRuleset(host.id, [extension.id]);
      const language = await EntitiesService.createEntity(session, extension.id, "languages", {
        name: "Fading Tongue",
        fields: { [LANGUAGE_TYPE]: "Standard" },
      });
      const copy = await EntitiesService.updateEntity(session, host.id, "languages", language.id, {
        name: "Fading Tongue",
        description: "Kept by the host",
        fields: { [LANGUAGE_TYPE]: "Standard" },
      });
      expect(await RulesetChangesService.getChanges(session, host.id)).toMatchObject([{ status: "modified" }]);

      // Its source gone, the copy is the host's own: listed as added, and its restore refused as no override's
      await EntitiesService.deleteEntity(session, extension.id, "languages", language.id);
      const listed = [
        { entityType: "languages" as const, status: "added" as const, entityId: copy.id, name: "Fading Tongue" },
      ];
      expect(await RulesetChangesService.getChanges(session, host.id)).toEqual(listed);
      const refusal = await RulesetChangesService.revertOverride(session, host.id, "languages", language.id).catch(
        (error: unknown) => error,
      );
      expect(refusal).toEqual(new NotFoundError("Entity is not an override in this ruleset"));
      // The refused restore deletes nothing: the copy stays the host's
      expect(await RulesetChangesService.getChanges(session, host.id)).toEqual(listed);
    });

    test("are only a fork's, and a private fork's only its members'", async () => {
      const { user, session } = await createTestUser();
      expect(RulesetChangesService.getChanges(session, (await createTestRuleset(user.id)).id)).rejects.toThrow(
        BadRequestError,
      );
      expect(RulesetChangesService.getChanges(session, NIL_UUID)).rejects.toThrow(NotFoundError);

      // A private fork isn't revealed to a stranger: its changes answer as an unknown ruleset's
      const { fork } = await setupChanges({ private: true });
      expect(RulesetChangesService.getChanges(session, fork.id)).rejects.toThrow(NotFoundError);
    });

    describe("reverting", () => {
      test("deletes a modified feat's copy with its customizations and aptitude links, showing the parent's again", async () => {
        const { session, fork, modified } = await setupChanges();
        const copy = await EntitiesService.updateEntity(session, fork.id, "feats", modified.id, {
          name: "Power Attack",
          description: "Changed",
        });
        await Modifiers.create(db, {
          sourceId: copy.id,
          sourceType: "feats",
          target: "combat.bab",
          value: "1",
          valueType: "number",
          operator: "add",
        });
        await writeFieldValues("feats", copy.id, [[FEAT_FAMILY, "combat"]]);
        await Requirements.create(db, { entityId: copy.id, entityType: "feats", level: "1", chainingOperator: "and" });

        await RulesetChangesService.revertOverride(session, fork.id, "feats", modified.id);

        expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);
        expect(
          await EntitiesService.getEntity(await ownerSessionOf(fork.id), fork.id, "feats", modified.id),
        ).toMatchObject({
          id: modified.id,
          description: null,
        });
        expect(await Modifiers.findMany(db, { sourceIds: [copy.id], sourceType: "feats" })).toEqual([]);
        expect(await findFormValues("feats", copy.id)).toEqual({ fields: {}, links: {} });
        expect(await Requirements.findMany(db, { entityIds: [copy.id], entityType: "feats" })).toEqual([]);
        expect(await findLists(db, [copy.id])).toEqual([]);
      });

      test("brings back an inherited feat the fork deleted", async () => {
        const { session, fork, deleted } = await setupChanges();
        await EntitiesService.deleteEntity(session, fork.id, "feats", deleted.id);
        await RulesetChangesService.revertOverride(session, fork.id, "feats", deleted.id);
        expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toEqual([]);
        expect(
          await EntitiesService.getEntity(await ownerSessionOf(fork.id), fork.id, "feats", deleted.id),
        ).toMatchObject({ id: deleted.id });
      });

      test("deletes a copied class's levels and class skills", async () => {
        const { session, parent, fork } = await setupChanges();
        const { klass, skill } = await addPlayableContent(parent.id);
        await Entities.create<KlassLevel>(db, "class-levels", { ownerId: klass.id, position: 1 });
        await addClassSkills(db, klass.id, [skill.id]);
        const copy = await copyEntity(db, "classes", klass.id, fork);

        await RulesetChangesService.revertOverride(session, fork.id, "classes", klass.id);

        expect(
          await Entities.findMany<KlassLevel>(db, { entityType: "class-levels", ownerIds: [copy.id as string] }),
        ).toEqual([]);
        expect(await EntityLinks.findMany(db, { fromIds: [copy.id as string], role: "classSkill" })).toEqual([]);
      });

      test("points the items made from a copied template back at the original", async () => {
        const { session, parent, fork } = await setupChanges();
        const [template] = await Entities.create<Item>(db, "items", {
          name: "Longsword",
          rulesetId: parent.id,
          fields: { [ITEM_IS_TEMPLATE]: true },
        });
        const copy = await copyEntity(db, "items", template.id, fork);
        const [made] = await Entities.create<Item>(db, "items", {
          name: "Longsword +1",
          rulesetId: fork.id,
          links: { madeFrom: copy.id as string },
        });

        await RulesetChangesService.revertOverride(session, fork.id, "items", template.id);
        expect(await Entities.findOne<Item>(db, { entityType: "items", id: made.id })).toMatchObject({
          links: { madeFrom: template.id },
        });
      });

      test("points a character's pick of the copy at the parent's, and is refused for an entity the fork didn't change", async () => {
        const { user, session, fork, aptitude, modified, untouched } = await setupChanges();
        const copy = await copyEntity(db, "feats", modified.id, fork);
        const character = await createTestCharacter(user.id, { rulesetId: fork.id });
        const { classLevel } = await createTestClassLevel(fork.id);
        const level = await addCharacterLevel(character.id, classLevel.id, {
          feats: { [aptitude.id]: [copy.id] },
        });

        await RulesetChangesService.revertOverride(session, fork.id, "feats", modified.id);
        expect(await findPicks("feats", [level.id])).toMatchObject([{ entityId: modified.id }]);
        expect(RulesetChangesService.revertOverride(session, fork.id, "feats", untouched.id)).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });
});
