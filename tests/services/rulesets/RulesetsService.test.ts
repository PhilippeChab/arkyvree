import { describe, expect, test } from "bun:test";

import { eq, type InferInsertModel } from "drizzle-orm";

import { DND35_COMPLETE_WARRIOR_NAME } from "@/database/packages/dnd35/names.ts";
import {
  featsAptitudesInRules,
  featsInRules,
  klassSkillsInRules,
  type rulesetsInRules,
  starredRulesetsInAccount,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "@/server/errors/index.ts";
import {
  Abilities,
  Aptitudes,
  EntitySnapshots,
  Feats,
  FeatsAptitudes,
  Items,
  Klasses,
  KlassLevels,
  KlassSkills,
  Modifiers,
  Players,
  Properties,
  Races,
  Requirements,
  Rulesets,
  Skills,
  StarredRulesets,
} from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/shared/dnd3.5/properties/index.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { addRulesetContributor } from "@/tests/support/contributors.ts";
import { insertRows } from "@/tests/support/database.ts";
import { addCharacterLevel, createTestKlassLevel } from "@/tests/support/levels.ts";
import { copyEntity, createTestRuleset } from "@/tests/support/rulesets.ts";
import { findSeededRuleset, getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

type RulesetValues = Partial<InferInsertModel<typeof rulesetsInRules>>;
const firstPage = { limit: 100, page: 1 };

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
  const [ability] = await Abilities.create(db, { name: "Strength", description: "Strength", rulesetId });
  const [[race], [klass], [skill], [feat]] = await Promise.all([
    Races.create(db, { name: "Human", rulesetId, size: "Medium", baseSpeed: 30 }),
    Klasses.create(db, { name: "Fighter", rulesetId, hd: 10 }),
    Skills.create(db, { name: "Climb", rulesetId, primaryAbilityId: ability.id }),
    Feats.create(db, { name: "Toughness", rulesetId }),
  ]);
  return { race, klass, skill, feat };
}

/** A published ruleset of `userId` (a system one when null), with a template item so forking it doesn't seed the engine's. */
async function createParent(userId: string | null = null, values: RulesetValues = {}) {
  const ruleset = await createTestRuleset(userId, { private: false, status: "Published", ...values });
  await Items.create(db, { name: "Template", rulesetId: ruleset.id, isTemplate: true });
  return ruleset;
}

/** A fork of another user's ruleset with three feats, and an aptitude that links one of them. */
async function setupChanges(values: { private?: boolean } = {}) {
  const { user: owner } = await createTestUser();
  const { user, session } = await createTestUser();
  const parent = await createParent(owner.id);
  const [aptitude] = await Aptitudes.create(db, { name: "General", rulesetId: parent.id });
  const [modified, deleted, untouched] = await insertRows(
    featsInRules,
    ["Power Attack", "Cleave", "Dodge"].map((name) => ({ name, rulesetId: parent.id })),
  );
  await FeatsAptitudes.create(db, { featId: modified.id, aptitudeId: aptitude.id });
  const forked = await fork(session, parent, values);
  return { user, session, owner, parent, fork: forked, aptitude, modified, deleted, untouched };
}

/** The user's view of a dozen rulesets: owned, others', system, contributed to and reached through a campaign. */
async function setupListing() {
  const { user, session } = await createTestUser();
  const { user: other } = await createTestUser();
  const base = await createTestRuleset(null, { private: false, status: "Published" });
  const fork = { rulesetId: base.id, ancestorRulesetIds: [base.id] };
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
  };
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
      ["community", ["ownPublic", "othersPublished"]],
      ["published", ["base", "ownDraft", "ownPublic", "othersPublished", "contributedDraft", "contributedPublished"]],
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
      ancestorRulesetIds: [parent.id],
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
      isUsedAsExtension: false,
    });
    await expect(RulesetsService.getRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
  });

  describe("forking", () => {
    test("makes the user a ruleset that inherits the parent's content without copying it", async () => {
      const { user: owner } = await createTestUser();
      const { user, session } = await createTestUser();
      const extension = await createTestRuleset(null, { private: false, status: "Published", kind: "extension" });
      const parent = await createParent(owner.id, {
        description: "Parent description",
        extensionRulesetIds: [extension.id],
      });
      const [aptitude] = await Aptitudes.create(db, { name: "General", rulesetId: parent.id });
      const feat = await FeatsService.createFeat({ ...session, userId: owner.id }, parent.id, {
        name: "Toughness",
        aptitudeIds: [aptitude.id],
      });
      await Properties.create(db, {
        entityId: parent.id,
        entityType: "rulesets",
        type: RULESET_SKILL_POINT_ABILITY_ID,
        value: aptitude.id,
      });

      const created = await fork(session, parent, { name: "My Fork", private: true });
      expect(created).toMatchObject({
        name: "My Fork",
        description: "Parent description",
        private: true,
        status: "Draft",
        userId: user.id,
        rulesetId: parent.id,
        ancestorRulesetIds: [parent.id],
        extensionRulesetIds: [extension.id],
        baseRules: parent.baseRules,
      });
      expect((await Feats.findPage(db, { rulesetId: created.id }, firstPage)).items).toEqual([]);
      expect(await EntitySnapshots.findMany(db, { rulesetId: created.id })).toEqual([]);
      expect(await FeatsService.getFeat(created.id, feat.id)).toMatchObject({
        id: feat.id,
        featsAptitudesInRules: [{ aptitudeId: aptitude.id }],
      });
      // Ruleset-wide settings are copied as they are.
      expect(await Properties.findMany(db, { entityIds: [created.id], entityType: "rulesets" })).toMatchObject([
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: aptitude.id },
      ]);

      expect((await fork(session, parent, { description: "Mine" })).description).toBe("Mine");
    });

    test("gives the fork the engine's template items when the parent has none", async () => {
      const { session } = await createTestUser();
      const withTemplates = await createParent();
      const withoutTemplates = await createTestRuleset(null, { private: false, status: "Published" });
      expect(
        await Items.findMany(db, { rulesetId: (await fork(session, withTemplates)).id, isTemplate: true }),
      ).toEqual([]);
      expect(
        (await Items.findMany(db, { rulesetId: (await fork(session, withoutTemplates)).id, isTemplate: true })).length,
      ).toBeGreaterThan(0);
    });

    test("refuses a fork of a fork, of a draft, of a missing ruleset, or under a taken name", async () => {
      const { user, session } = await createTestUser();
      const parent = await createParent();
      const first = await fork(session, parent);
      await Rulesets.update(db, { status: "Published" }, { id: first.id });

      await expect(fork(session, first)).rejects.toThrow(UnprocessableEntityError);
      await expect(fork(session, await createTestRuleset(null, { private: false }))).rejects.toThrow(
        UnprocessableEntityError,
      );
      await expect(fork(session, { id: NIL_UUID })).rejects.toThrow(NotFoundError);
      await expect(fork(session, parent, { name: (await createTestRuleset(user.id)).name })).rejects.toThrow(
        ConflictError,
      );
    });

    test("lets an ordinary account override more than 25 inherited entities", async () => {
      const { session } = await createTestUser();
      const { rulesetId } = await getSeedCtx();
      const created = await fork(session, { id: rulesetId }, { private: true });
      const feats = await Feats.findPage(db, { rulesetId }, { limit: 26, page: 1 });
      for (const feat of feats.items) expect((await copyEntity(db, "feats", feat.id, created)).id).not.toBe(feat.id);

      expect(await EntitySnapshots.findMany(db, { rulesetId: created.id })).toHaveLength(26);
    });
  });

  describe("archiving", () => {
    test("archives a ruleset in use, leaving its content live, and unarchives it as a draft", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Published" });
      const { feat, race } = await addPlayableContent(ruleset.id);
      await Properties.create(db, { entityId: feat.id, entityType: "feats", type: "tag", value: "combat" });
      await createTestCampaign(user.id, ruleset.id);
      await createTestCharacter(user.id, { rulesetId: ruleset.id, raceId: race.id });

      expect(await RulesetsService.archiveRuleset(session, ruleset.id)).toMatchObject({ status: "Archived" });
      expect(await Feats.findOne(db, { id: feat.id })).toMatchObject({ deletedAt: null });
      expect(await Properties.findMany(db, { entityIds: [feat.id], entityType: "feats" })).toHaveLength(1);

      expect(await RulesetsService.unarchiveRuleset(session, ruleset.id)).toMatchObject({ status: "Draft" });
    });

    test("refuses another user's ruleset, a base, a missing one, and unarchiving one that isn't archived", async () => {
      const { user, session } = await createTestUser();
      const { session: other } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const base = await createTestRuleset(null, { private: false, status: "Published" });

      await expect(RulesetsService.archiveRuleset(other, ruleset.id)).rejects.toThrow(ForbiddenError);
      await expect(RulesetsService.archiveRuleset(session, base.id)).rejects.toThrow(ForbiddenError);
      await expect(RulesetsService.archiveRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
      await expect(RulesetsService.unarchiveRuleset(session, ruleset.id)).rejects.toThrow(ForbiddenError);
      await expect(RulesetsService.unarchiveRuleset(session, base.id)).rejects.toThrow(ForbiddenError);
      await expect(RulesetsService.unarchiveRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
      await RulesetsService.archiveRuleset(session, ruleset.id);
      await expect(RulesetsService.unarchiveRuleset(other, ruleset.id)).rejects.toThrow(ForbiddenError);
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
      await expect(RulesetsService.publishRuleset(session, empty.id)).rejects.toEqual(
        new UnprocessableEntityError("Ruleset requires at least one of each: race, class, skill, feat"),
      );

      const partial = await createTestRuleset(user.id);
      const { race, klass } = await addPlayableContent(partial.id);
      await Races.delete(db, { id: race.id });
      await Klasses.delete(db, { id: klass.id });
      await expect(RulesetsService.publishRuleset(session, partial.id)).rejects.toEqual(
        new UnprocessableEntityError("Ruleset requires at least one of each: race, class"),
      );
    });

    test("publishes a fork as an extension without playable content, unless it isn't a fork or uses extensions itself", async () => {
      const { user, session } = await createTestUser();
      const { rulesetId } = await getSeedCtx();
      const extension = await fork(session, { id: rulesetId });
      expect(await RulesetsService.publishRuleset(session, extension.id, { kind: "extension" })).toMatchObject({
        kind: "extension",
        status: "Published",
      });

      await expect(
        RulesetsService.publishRuleset(session, (await createTestRuleset(user.id)).id, { kind: "extension" }),
      ).rejects.toThrow(UnprocessableEntityError);
      const host = await fork(session, { id: rulesetId });
      const seedExtension = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
      await RulesetExtensionsService.subscribeExtension(session, host.id, [seedExtension.id]);
      await expect(RulesetsService.publishRuleset(session, host.id, { kind: "extension" })).rejects.toThrow(
        UnprocessableEntityError,
      );
    });

    test("refuses another user's ruleset, a base, a published or archived one, and a missing one", async () => {
      const { user, session } = await createTestUser();
      const { session: other } = await createTestUser();
      const draft = await createTestRuleset(user.id);
      await addPlayableContent(draft.id);

      await expect(RulesetsService.publishRuleset(other, draft.id)).rejects.toThrow(ForbiddenError);
      await expect(RulesetsService.publishRuleset(session, (await createTestRuleset(null)).id)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(
        RulesetsService.publishRuleset(session, (await createTestRuleset(user.id, { status: "Published" })).id),
      ).rejects.toThrow(UnprocessableEntityError);
      await expect(
        RulesetsService.publishRuleset(session, (await createTestRuleset(user.id, { status: "Archived" })).id),
      ).rejects.toThrow(UnprocessableEntityError);
      await expect(RulesetsService.publishRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("updating", () => {
    test("changes the name, the description and makes a private ruleset public, but never the reverse", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const update = { name: `Renamed ${uniqueId()}`, description: "Updated", private: false };
      expect(await RulesetsService.updateRuleset(session, ruleset.id, update)).toMatchObject(update);
      await expect(RulesetsService.updateRuleset(session, ruleset.id, { ...update, private: true })).rejects.toThrow(
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
      await expect(update(standalone.id, standalone.name)).rejects.toThrow(UnprocessableEntityError);
    });

    test("refuses an edit started from a stale copy", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const edit = (name: string) =>
        RulesetsService.updateRuleset(session, ruleset.id, { name, description: "", updatedAt: ruleset.updatedAt });
      await edit(`First ${uniqueId()}`);
      await expect(edit(`Second ${uniqueId()}`)).rejects.toThrow(ConflictError);
    });

    test("refuses another user's ruleset, a base, an archived one and a missing one", async () => {
      const { user, session } = await createTestUser();
      const { session: other } = await createTestUser();
      const body = { name: "Updated", description: "Updated" };
      await expect(RulesetsService.updateRuleset(other, (await createTestRuleset(user.id)).id, body)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(RulesetsService.updateRuleset(session, (await createTestRuleset(null)).id, body)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(
        RulesetsService.updateRuleset(session, (await createTestRuleset(user.id, { status: "Archived" })).id, body),
      ).rejects.toThrow(UnprocessableEntityError);
      await expect(RulesetsService.updateRuleset(session, NIL_UUID, body)).rejects.toThrow(NotFoundError);
    });
  });

  describe("starring", () => {
    test("stars published public bases and extensions, not drafts, private rulesets or forks published as rulesets", async () => {
      const { user, session } = await createTestUser();
      const base = await createTestRuleset(null, { private: false, status: "Published" });
      const fork: RulesetValues = {
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
        private: false,
        status: "Published",
      };
      const star = async (values: RulesetValues) =>
        RulesetsService.starRuleset(session, (await createTestRuleset(user.id, values)).id);

      await RulesetsService.starRuleset(session, base.id);
      await star({ ...fork, kind: "extension" });
      expect(await StarredRulesets.findMany(db, { userId: user.id })).toHaveLength(2);

      await expect(star({ private: false })).rejects.toThrow(ForbiddenError);
      await expect(star({ status: "Published" })).rejects.toThrow(ForbiddenError);
      await expect(star(fork)).rejects.toThrow(ForbiddenError);
      await expect(RulesetsService.starRuleset(session, NIL_UUID)).rejects.toThrow(NotFoundError);
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
    test("lists the entities it modified, deleted and added", async () => {
      const { session, fork, modified, deleted } = await setupChanges();
      expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);

      const copy = await FeatsService.updateFeat(session, fork.id, modified.id, {
        name: "Power Attack",
        description: "Changed",
      });
      await FeatsService.deleteFeat(session, fork.id, deleted.id);
      const [added] = await Feats.create(db, { name: "Homebrew", rulesetId: fork.id });

      const changes = await RulesetChangesService.getChanges(session, fork.id);
      expect([...changes].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
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

    test("are only a fork's, and a private fork's only its members'", async () => {
      const { user, session } = await createTestUser();
      await expect(RulesetChangesService.getChanges(session, (await createTestRuleset(user.id)).id)).rejects.toThrow(
        BadRequestError,
      );
      await expect(RulesetChangesService.getChanges(session, NIL_UUID)).rejects.toThrow(NotFoundError);

      const { fork } = await setupChanges({ private: true });
      await expect(RulesetChangesService.getChanges(session, fork.id)).rejects.toThrow(ForbiddenError);
    });

    describe("reverting", () => {
      test("deletes a modified feat's copy with its customizations and aptitude links, showing the parent's again", async () => {
        const { session, fork, modified } = await setupChanges();
        const copy = await FeatsService.updateFeat(session, fork.id, modified.id, {
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
        await Properties.create(db, { entityId: copy.id, entityType: "feats", type: "tag", value: "combat" });
        await Requirements.create(db, { entityId: copy.id, entityType: "feats", level: "1", chainingOperator: "and" });

        await RulesetChangesService.revertOverride(session, fork.id, "feats", modified.id);

        expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);
        expect(await FeatsService.getFeat(fork.id, modified.id)).toMatchObject({
          id: modified.id,
          description: null,
        });
        expect(await Modifiers.findMany(db, { sourceIds: [copy.id], sourceType: "feats" })).toEqual([]);
        expect(await Properties.findMany(db, { entityIds: [copy.id], entityType: "feats" })).toEqual([]);
        expect(await Requirements.findMany(db, { entityIds: [copy.id], entityType: "feats" })).toEqual([]);
        expect(await db.select().from(featsAptitudesInRules).where(eq(featsAptitudesInRules.featId, copy.id))).toEqual(
          [],
        );
      });

      test("brings back an inherited feat the fork deleted", async () => {
        const { session, fork, deleted } = await setupChanges();
        await FeatsService.deleteFeat(session, fork.id, deleted.id);
        await RulesetChangesService.revertOverride(session, fork.id, "feats", deleted.id);
        expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toEqual([]);
        expect(await FeatsService.getFeat(fork.id, deleted.id)).toMatchObject({ id: deleted.id });
      });

      test("deletes a copied class's levels and class skills", async () => {
        const { session, parent, fork } = await setupChanges();
        const { klass, skill } = await addPlayableContent(parent.id);
        await KlassLevels.create(db, { klassId: klass.id, level: 1 });
        await KlassSkills.create(db, { klassId: klass.id, skillId: skill.id });
        const copy = await copyEntity(db, "klasses", klass.id, fork);

        await RulesetChangesService.revertOverride(session, fork.id, "klasses", klass.id);

        expect(await KlassLevels.findMany(db, { klassId: copy.id as string })).toEqual([]);
        expect(
          await db
            .select()
            .from(klassSkillsInRules)
            .where(eq(klassSkillsInRules.klassId, copy.id as string)),
        ).toEqual([]);
      });

      test("points the items made from a copied template back at the original", async () => {
        const { session, parent, fork } = await setupChanges();
        const [template] = await Items.create(db, { name: "Longsword", rulesetId: parent.id, isTemplate: true });
        const copy = await copyEntity(db, "items", template.id, fork);
        const [made] = await Items.create(db, {
          name: "Longsword +1",
          rulesetId: fork.id,
          sourceItemId: copy.id as string,
        });

        await RulesetChangesService.revertOverride(session, fork.id, "items", template.id);
        expect(await Items.findOne(db, { id: made.id })).toMatchObject({ sourceItemId: template.id });
      });

      test("is refused for a copy a character picked, and for an entity the fork didn't change", async () => {
        const { user, session, fork, aptitude, modified, untouched } = await setupChanges();
        const copy = await copyEntity(db, "feats", modified.id, fork);
        const character = await createTestCharacter(user.id, { rulesetId: fork.id });
        const { klassLevel } = await createTestKlassLevel(fork.id);
        await addCharacterLevel(character.id, klassLevel.id, {
          feats: [{ featId: copy.id as string, aptitudeId: aptitude.id }],
        });

        // Reverting deletes the copy, and with it the character's pick.
        await expect(RulesetChangesService.revertOverride(session, fork.id, "feats", modified.id)).rejects.toThrow(
          ConflictError,
        );
        await expect(RulesetChangesService.revertOverride(session, fork.id, "feats", untouched.id)).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });
});
