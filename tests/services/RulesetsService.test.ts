import { and, eq, isNull } from "drizzle-orm";

import { DND35_COMPLETE_DIVINE_NAME, DND35_COMPLETE_WARRIOR_NAME, DND35_DMG_NAME, DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { db } from "@/server/database/index.ts";
import {
  abilitiesInRules,
  aptitudesInRules,
  characterAbilitiesInCharacter,
  charactersInCharacter,
  featsAptitudesInRules,
  featsInRules,
  klassSkillsInRules,
  klassesInRules,
  levelFeatsInCharacter,
  levelsInCharacter,
  propertiesInCustomization,
  racesInRules,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import {
  Abilities,
  Aptitudes,
  Campaigns,
  Characters,
  Contributors,
  EntitySnapshots,
  Feats,
  FeatsAptitudes,
  Items,
  Klasses,
  KlassLevels,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevelSaves,
  KlassSkills,
  Languages,
  Modifiers,
  Players,
  PowersAptitudes,
  Properties,
  Races,
  Requirements,
  Rulesets,
  Saves,
  Skills,
  Powers,
  StarredRulesets,
  Users,
} from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS, RULESET_SKILL_POINT_ABILITY_ID } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { buildOverrideMap, cowEntity, cowEntityForCustomization, deleteModifiersWithCascade, fetchEntityCustomizations, getOrBuildCowData, invalidateAllCowData, type EntityWithId } from "@/server/services/rulesets/cow.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("RulesetsService", () => {
  // Helper to create test session
  function createTestSession(userId: string): Session {
    return {
      id: `session-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // Helper to create test user
  async function createTestUser() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    return { user, session: createTestSession(user.id) };
  }

  test("an ordinary account can create multiple public forks, publish, and restore them", async () => {
    const { session } = await createTestUser();
    const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
    if (!base) throw new Error("Seed ruleset missing");
    const first = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `First public fork ${crypto.randomUUID()}`, private: false,
    });
    const second = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Second private fork ${crypto.randomUUID()}`, private: true,
    });
    expect(first.private).toBe(false);
    expect(second.private).toBe(true);
    const updated = await RulesetsMethods.updateRuleset(session, second.id, {
      name: second.name, description: "Now public", private: false,
    });
    expect(updated.private).toBe(false);
    const published = await RulesetsMethods.publishRuleset(session, first.id);
    expect(published.status).toBe("Published");
    await RulesetsMethods.archiveRuleset(session, first.id);
    await RulesetsMethods.unarchiveRuleset(session, first.id);
    expect((await Rulesets.findOne(db, { id: first.id }))?.status).not.toBe("Archived");
  });

  test("an ordinary account can override more than 25 inherited entities", async () => {
    const { session } = await createTestUser();
    const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
    if (!base) throw new Error("Seed ruleset missing");
    const fork = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Override capacity ${crypto.randomUUID()}`, private: true,
    });
    const feats = await Feats.findManyByRulesetId(db, { rulesetId: base.id }, { limit: 26, page: 1 });
    expect(feats.items).toHaveLength(26);
    for (const feat of feats.items) {
      const overridden = await cowEntity(db, "feats", feat.id, fork.id, [base.id]);
      expect(overridden.id).not.toBe(feat.id);
    }
  });

  // Helper to create test ruleset
  async function createTestRuleset(userId: string, options: {
    name?: string;
    description?: string;
    private?: boolean;
    status?: "Draft" | "Published" | "Archived";
    seedTemplateItems?: boolean;
  } = {}) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const rulesets = await Rulesets.create(db, {
      name: options.name || `Test Ruleset ${uniqueId}`,
      description: options.description || "Test ruleset description",
      private: options.private ?? true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId,
      status: options.status || "Draft",
    });

    const ruleset = rulesets[0];

    // Seed a dummy template item so forkRuleset skips the full 85-item template seed.
    // Pass seedTemplateItems: true to get real templates instead.
    if (!options.seedTemplateItems) {
      await Items.createMany(db, [{ name: "_template", description: "", rulesetId: ruleset.id, isTemplate: true }]);
    }

    return ruleset;
  }

  // Helper to create a test ability for a ruleset
  async function createTestAbility(rulesetId: string, name: string = "Strength") {
    const abilities = await Abilities.create(db, {
      name,
      description: `${name} ability`,
      rulesetId,
    });
    return abilities[0];
  }

  // Helper to create a base ruleset (no userId)
  async function createBaseRuleset() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const rulesets = await Rulesets.create(db, {
      name: `Base Ruleset ${uniqueId}`,
      description: "Base ruleset description",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: null,
      status: "Published",
    });

    return rulesets[0];
  }

  describe("getAllRulesets", () => {
    test("should return all rulesets for authenticated user", async () => {
      const { session } = await createTestUser();

      const result = await RulesetsMethods.getAllRulesets(
        session,
        {},
        { limit: 10, page: 1 }
      );

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.page).toBeDefined();
      expect(result.page).toBe(1);
    });

    test("should filter rulesets by scope: base", async () => {
      const { session } = await createTestUser();
      await createBaseRuleset();

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "base" },
        { limit: 10, page: 1 }
      );

      expect(result.items).toBeDefined();
      // All returned rulesets should have no userId (base rulesets)
      for (const ruleset of result.items) {
        expect(ruleset.userId).toBeNull();
      }
    });

    test("should filter rulesets by scope: createdByMe", async () => {
      const { user, session } = await createTestUser();
      await createTestRuleset(user.id);

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "createdByMe" },
        { limit: 10, page: 1 }
      );

      expect(result.items).toBeDefined();
      // All returned rulesets should be created by the user
      for (const ruleset of result.items) {
        expect(ruleset.userId).toBe(user.id);
      }
    });

    test("should filter rulesets by scope: createdByMePrivate", async () => {
      const { user, session } = await createTestUser();
      await createTestRuleset(user.id, { private: true });
      await createTestRuleset(user.id, { private: false });

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "createdByMePrivate" },
        { limit: 10, page: 1 }
      );

      expect(result.items).toBeDefined();
      // All returned rulesets should be private and created by the user
      for (const ruleset of result.items) {
        expect(ruleset.userId).toBe(user.id);
        expect(ruleset.private).toBe(true);
      }
    });

    test("should filter rulesets by scope: archived", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      await Rulesets.archive(db, { id: ruleset.id });

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "archived" },
        { limit: 10, page: 1 }
      );

      expect(result.items).toBeDefined();
      // All returned rulesets should be archived
      for (const ruleset of result.items) {
        expect(ruleset.status).toBe("Archived");
      }
    });

    test("scope: myDrafts surfaces drafts the user is an active contributor on", async () => {
      const { user: owner } = await createTestUser();
      const { user: contributor, session: contributorSession } = await createTestUser();
      const draft = await createTestRuleset(owner.id, { status: "Draft" });
      const [created] = await Contributors.create(db, {
        rulesetId: draft.id,
        userId: contributor.id,
        email: contributor.emailAddress,
        role: "Editor",
        invitedBy: owner.id,
      });
      await Contributors.update(db, { status: "Active" }, { id: created.id });

      const result = await RulesetsMethods.getAllRulesets(
        contributorSession,
        { scope: "myDrafts" },
        { limit: 10, page: 1 },
      );

      expect(result.items.some((r) => r.id === draft.id)).toBe(true);
    });

    test("scope: published surfaces the user's own draft (status gate only applies to public rulesets)", async () => {
      const { user, session } = await createTestUser();
      const draft = await createTestRuleset(user.id, { status: "Draft", private: true });

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "published" },
        { limit: 10, page: 1 },
      );

      expect(result.items.some((r) => r.id === draft.id)).toBe(true);
    });

    test("scope: published surfaces drafts the user is an active contributor on", async () => {
      const { user: owner } = await createTestUser();
      const { user: contributor, session: contributorSession } = await createTestUser();
      const draft = await createTestRuleset(owner.id, { status: "Draft", private: true });
      const [created] = await Contributors.create(db, {
        rulesetId: draft.id,
        userId: contributor.id,
        email: contributor.emailAddress,
        role: "Editor",
        invitedBy: owner.id,
      });
      await Contributors.update(db, { status: "Active" }, { id: created.id });

      const result = await RulesetsMethods.getAllRulesets(
        contributorSession,
        { scope: "published" },
        { limit: 10, page: 1 },
      );

      expect(result.items.some((r) => r.id === draft.id)).toBe(true);
    });

    test("scope: published does NOT surface other users' public drafts", async () => {
      const { user: owner } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const draft = await createTestRuleset(owner.id, { status: "Draft", private: false });

      const result = await RulesetsMethods.getAllRulesets(
        otherSession,
        { scope: "published" },
        { limit: 100, page: 1 },
      );

      expect(result.items.some((r) => r.id === draft.id)).toBe(false);
    });

    test("scope: published surfaces private published rulesets the user is an active contributor on", async () => {
      const { user: owner } = await createTestUser();
      const { user: contributor, session: contributorSession } = await createTestUser();
      const ruleset = await createTestRuleset(owner.id, { status: "Published", private: true });
      const [created] = await Contributors.create(db, {
        rulesetId: ruleset.id,
        userId: contributor.id,
        email: contributor.emailAddress,
        role: "Editor",
        invitedBy: owner.id,
      });
      await Contributors.update(db, { status: "Active" }, { id: created.id });

      const result = await RulesetsMethods.getAllRulesets(
        contributorSession,
        { scope: "published" },
        { limit: 10, page: 1 },
      );

      expect(result.items.some((r) => r.id === ruleset.id)).toBe(true);
    });

    test("should search rulesets by name", async () => {
      const { user, session } = await createTestUser();
      await createTestRuleset(user.id, { name: "Unique Search Name 12345" });

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { search: "Unique Search Name" },
        { limit: 10, page: 1 }
      );

      expect(result.items.length).toBeGreaterThan(0);
      const found = result.items.some((r) =>
        r.name.includes("Unique Search Name")
      );
      expect(found).toBe(true);
    });

    test("should order rulesets by createdAt desc", async () => {
      const { session } = await createTestUser();

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { orderBy: "createdAt", orderDir: "desc" },
        { limit: 10, page: 1 }
      );

      expect(result.items).toBeDefined();
      // Verify descending order
      for (let i = 0; i < result.items.length - 1; i++) {
        const current = new Date(result.items[i].createdAt);
        const next = new Date(result.items[i + 1].createdAt);
        expect(current >= next).toBe(true);
      }
    });

    test("should include original ruleset name for forked rulesets", async () => {
      const { user, session } = await createTestUser();
      const originalRuleset = await createTestRuleset(user.id, {
        name: "Original Ruleset For Fork",
        status: "Published",
      });

      // Add at least one entity of each type to avoid empty array issues
      const forkAbility = await createTestAbility(originalRuleset.id);
      await Skills.createMany(db, [
        {
          name: "Fork Test Skill",
          description: "Test skill",
          rulesetId: originalRuleset.id,
          primaryAbilityId: forkAbility.id,
        },
      ]);

      await Feats.createMany(db, [
        {
          name: "Fork Test Feat",
          description: "Test feat",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Powers.createMany(db, [
        {
          name: "Fork Test Power",
          description: "Test power",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Items.createMany(db, [
        {
          name: "Fork Test Item",
          description: "Test item",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Races.createMany(db, [
        {
          name: "Fork Test Race",
          description: "Test race",
          rulesetId: originalRuleset.id,
          size: "Medium",
          baseSpeed: 30,
        },
      ]);

      await Languages.createMany(db, [
        {
          name: "Fork Test Language",
          description: "Test language",
          rulesetId: originalRuleset.id,
          type: "Standard",
        },
      ]);

      await Klasses.createMany(db, [
        {
          name: "Fork Test Class",
          description: "Test class",
          rulesetId: originalRuleset.id,
          hd: 8,
        },
      ]);

      await Aptitudes.createMany(db, [
        {
          name: "Fork Test Aptitude",
          description: "Test aptitude",
          rulesetId: originalRuleset.id,
        },
      ]);

      // Fork the ruleset
      const forkedRuleset = await RulesetsMethods.forkRuleset(
        session,
        originalRuleset.id,
        { name: "Forked Ruleset Name Test", private: false }
      );

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "forked" },
        { limit: 10, page: 1 }
      );

      const found = result.items.find((r) => r.id === forkedRuleset.id);
      expect(found).toBeDefined();
      expect(found?.rulesetName).toBe("Original Ruleset For Fork");
    });

    test("should paginate results correctly", async () => {
      const { session } = await createTestUser();

      const result = await RulesetsMethods.getAllRulesets(
        session,
        {},
        { limit: 5, page: 1 }
      );

      expect(result.page).toBeDefined();
      expect(result.page).toBe(1);
      expect(result.items.length).toBeLessThanOrEqual(5);
    });

    test("should include private rulesets from campaigns user is invited to in default scope", async () => {
      const { user: owner } = await createTestUser();
      const { user: member, session: memberSession } = await createTestUser();

      const ruleset = await createTestRuleset(owner.id, { private: true });

      const campaigns = await Campaigns.create(db, {
        name: "Test Campaign",
        description: "Campaign with private ruleset",
        rulesetId: ruleset.id,
      });

      await Players.create(db, {
        userId: member.id,
        campaignId: campaigns[0].id,
        role: "Player Character",
      });

      const result = await RulesetsMethods.getAllRulesets(
        memberSession,
        {},
        { limit: 100, page: 1 },
      );

      const found = result.items.find((r) => r.id === ruleset.id);
      expect(found).toBeDefined();
    });

    test("should filter by campaignAccessible scope", async () => {
      const { user: owner } = await createTestUser();
      const { user: member, session: memberSession } = await createTestUser();

      const ruleset = await createTestRuleset(owner.id, { private: true });

      const campaigns = await Campaigns.create(db, {
        name: "Test Campaign",
        description: "Campaign with private ruleset",
        rulesetId: ruleset.id,
      });

      await Players.create(db, {
        userId: member.id,
        campaignId: campaigns[0].id,
        role: "Player Character",
      });

      const result = await RulesetsMethods.getAllRulesets(
        memberSession,
        { scope: "campaignAccessible" },
        { limit: 100, page: 1 },
      );

      const found = result.items.find((r) => r.id === ruleset.id);
      expect(found).toBeDefined();
    });

    test("should not include private rulesets from campaigns user is not in", async () => {
      const { user: owner } = await createTestUser();
      const { session: outsiderSession } = await createTestUser();

      const ruleset = await createTestRuleset(owner.id, { private: true });

      await Campaigns.create(db, {
        name: "Test Campaign",
        description: "Campaign with private ruleset",
        rulesetId: ruleset.id,
      });

      const result = await RulesetsMethods.getAllRulesets(
        outsiderSession,
        {},
        { limit: 100, page: 1 },
      );

      const found = result.items.find((r) => r.id === ruleset.id);
      expect(found).toBeUndefined();
    });
  });

  describe("getRulesetById", () => {
    test("should return ruleset by id", async () => {
      const { user, session } = await createTestUser();
      const created = await createTestRuleset(user.id);

      const ruleset = await RulesetsMethods.getRulesetById(session, created.id);

      expect(ruleset).toBeDefined();
      expect(ruleset.id).toBe(created.id);
      expect(ruleset.name).toBe(created.name);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUser();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RulesetsMethods.getRulesetById(session, fakeRulesetId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("forkRuleset", () => {
    test("should refuse to fork an existing fork", async () => {
      const { user, session } = await createTestUser();
      const base = await createTestRuleset(user.id, { status: "Published" });
      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `First fork ${Math.random().toString(36).substr(2, 6)}`,
        private: false,
      });
      // Skip the publish-validation pipeline; we only need the fork to be
      // Published so canFork passes the status check.
      await Rulesets.update(db, { status: "Published" }, { id: fork.id });

      await expect(
        RulesetsMethods.forkRuleset(session, fork.id, {
          name: `Second fork ${Math.random().toString(36).substr(2, 6)}`,
          private: false,
        }),
      ).rejects.toThrow(UnprocessableEntityError);
    });

    test("should fork a ruleset with all entities", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      // Create original ruleset with entities
      const originalRuleset = await createTestRuleset(user.id, { status: "Published", seedTemplateItems: true });

      // Add some entities to the original ruleset
      const forkAbility2 = await createTestAbility(originalRuleset.id);
      const skill = await Skills.createMany(db, [
        {
          name: "Test Skill",
          description: "Test skill description",
          rulesetId: originalRuleset.id,
          primaryAbilityId: forkAbility2.id,
        },
      ]);

      await Feats.createMany(db, [
        {
          name: "Test Feat",
          description: "Test feat description",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Powers.createMany(db, [
        {
          name: "Test Power",
          description: "Test power description",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Items.createMany(db, [
        {
          name: "Test Item",
          description: "Test item description",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Races.createMany(db, [
        {
          name: "Test Race",
          description: "Test race description",
          rulesetId: originalRuleset.id,
          size: "Medium",
          baseSpeed: 30,
        },
      ]);

      await Languages.createMany(db, [
        {
          name: "Test Language",
          description: "Test language description",
          rulesetId: originalRuleset.id,
          type: "Standard",
        },
      ]);

      await Klasses.createMany(db, [
        {
          name: "Test Class",
          description: "Test class description",
          rulesetId: originalRuleset.id,
          hd: 8,
        },
      ]);

      await Aptitudes.createMany(db, [
        {
          name: "Test Aptitude",
          description: "Test aptitude description",
          rulesetId: originalRuleset.id,
        },
      ]);

      // Fork the ruleset
      const forkedRuleset = await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        {
          name: "Forked Ruleset",
          description: "This is a forked ruleset",
          private: false,
        }
      );

      expect(forkedRuleset).toBeDefined();
      expect(forkedRuleset.name).toBe("Forked Ruleset");
      expect(forkedRuleset.description).toBe("This is a forked ruleset");
      expect(forkedRuleset.rulesetId).toBe(originalRuleset.id);
      expect(forkedRuleset.userId).toBe(otherSession.userId);
      expect(forkedRuleset.baseRules).toBe(originalRuleset.baseRules);

      // COW: fork is lightweight — no entity copies created
      const ownedSkills = await Skills.findManyByRulesetId(db, {
        rulesetId: forkedRuleset.id,
      }, { limit: 10000, page: 1 });
      expect(ownedSkills.items.length).toBe(0);

      // COW: entities accessible via inheritance with ancestorRulesetIds
      const inheritedSkills = await Skills.findAll((pagination) =>
        Skills.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedSkills.length).toBe(1);
      expect(inheritedSkills[0].name).toBe("Test Skill");
      expect(inheritedSkills[0].id).toBe(skill[0].id); // Same ID (inherited, not copied)

      const inheritedFeats = await Feats.findAll((pagination) =>
        Feats.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedFeats.length).toBe(1);
      expect(inheritedFeats[0].name).toBe("Test Feat");

      const inheritedPowers = await Powers.findAll((pagination) =>
        Powers.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedPowers.length).toBe(1);
      expect(inheritedPowers[0].name).toBe("Test Power");

      const inheritedItems = await Items.findAll((pagination) =>
        Items.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id], isTemplate: false }, pagination),
      );
      expect(inheritedItems.length).toBe(1);
      expect(inheritedItems[0].name).toBe("Test Item");

      // Verify template items were seeded
      const forkedTemplates = await Items.findTemplates(db, { rulesetId: forkedRuleset.id });
      expect(forkedTemplates.length).toBeGreaterThan(0);

      const inheritedRaces = await Races.findAll((pagination) =>
        Races.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedRaces.length).toBe(1);
      expect(inheritedRaces[0].name).toBe("Test Race");

      const inheritedLanguages = await Languages.findAll((pagination) =>
        Languages.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedLanguages.length).toBe(1);
      expect(inheritedLanguages[0].name).toBe("Test Language");

      const inheritedKlasses = await Klasses.findAll((pagination) =>
        Klasses.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedKlasses.length).toBe(1);
      expect(inheritedKlasses[0].name).toBe("Test Class");

      const inheritedAptitudes = await Aptitudes.findAll((pagination) =>
        Aptitudes.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedAptitudes.length).toBe(1);
      expect(inheritedAptitudes[0].name).toBe("Test Aptitude");

      // COW: zero snapshots on fresh fork
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: forkedRuleset.id });
      expect(snapshots.length).toBe(0);
    });

    test("should fork ruleset with relationships", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      // Create original ruleset
      const originalRuleset = await createTestRuleset(user.id, { status: "Published" });

      // Create entities with relationships
      const relAbility = await createTestAbility(originalRuleset.id);
      const skill = await Skills.createMany(db, [
        {
          name: "Test Skill",
          description: "Test skill",
          rulesetId: originalRuleset.id,
          primaryAbilityId: relAbility.id,
        },
      ]);

      const klass = await Klasses.createMany(db, [
        {
          name: "Test Class",
          description: "Test class",
          rulesetId: originalRuleset.id,
          hd: 10,
        },
      ]);

      const aptitude = await Aptitudes.createMany(db, [
        {
          name: "Test Aptitude",
          description: "Test aptitude",
          rulesetId: originalRuleset.id,
        },
      ]);

      const feat = await Feats.createMany(db, [
        {
          name: "Test Feat",
          description: "Test feat",
          rulesetId: originalRuleset.id,
        },
      ]);

      // Add other entities to avoid empty arrays
      await Powers.createMany(db, [
        {
          name: "Relationships Test Power",
          description: "Test power",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Items.createMany(db, [
        {
          name: "Relationships Test Item",
          description: "Test item",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Races.createMany(db, [
        {
          name: "Relationships Test Race",
          description: "Test race",
          rulesetId: originalRuleset.id,
          size: "Medium",
          baseSpeed: 30,
        },
      ]);

      await Languages.createMany(db, [
        {
          name: "Relationships Test Language",
          description: "Test language",
          rulesetId: originalRuleset.id,
          type: "Standard",
        },
      ]);

      // Create relationships
      await KlassSkills.createMany(db, [
        {
          klassId: klass[0].id,
          skillId: skill[0].id,
        },
      ]);

      await FeatsAptitudes.createMany(db, [
        {
          featId: feat[0].id,
          aptitudeId: aptitude[0].id,
        },
      ]);

      // Fork the ruleset
      const forkedRuleset = await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked with Relationships", private: false }
      );

      // COW: relationships stay on parent entities (inherited, not copied)
      const inheritedKlasses = await Klasses.findAll((pagination) =>
        Klasses.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedKlasses.length).toBe(1);
      // Relationships are on the parent entity (same ID)
      const inheritedKlassSkills = await KlassSkills.findMany(db, {
        klassIds: [klass[0].id],
      });
      expect(inheritedKlassSkills.length).toBe(1);

      const inheritedFeats = await Feats.findAll((pagination) =>
        Feats.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedFeats.length).toBe(1);
      const inheritedFeatsAptitudes = await FeatsAptitudes.findMany(db, {
        featIds: [feat[0].id],
      });
      expect(inheritedFeatsAptitudes.length).toBe(1);
    });

    test("should fork ruleset with class levels and customizations", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      // Create original ruleset
      const originalRuleset = await createTestRuleset(user.id, { status: "Published" });

      // Add required entities to avoid empty array issues
      const custAbility = await createTestAbility(originalRuleset.id);
      await Skills.createMany(db, [
        {
          name: "Customizations Test Skill",
          description: "Test skill",
          rulesetId: originalRuleset.id,
          primaryAbilityId: custAbility.id,
        },
      ]);

      await Powers.createMany(db, [
        {
          name: "Customizations Test Power",
          description: "Test power",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Items.createMany(db, [
        {
          name: "Customizations Test Item",
          description: "Test item",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Races.createMany(db, [
        {
          name: "Customizations Test Race",
          description: "Test race",
          rulesetId: originalRuleset.id,
          size: "Medium",
          baseSpeed: 30,
        },
      ]);

      await Languages.createMany(db, [
        {
          name: "Customizations Test Language",
          description: "Test language",
          rulesetId: originalRuleset.id,
          type: "Standard",
        },
      ]);

      await Aptitudes.createMany(db, [
        {
          name: "Customizations Test Aptitude",
          description: "Test aptitude",
          rulesetId: originalRuleset.id,
        },
      ]);

      // Create class with levels
      const klass = await Klasses.createMany(db, [
        {
          name: "Fighter",
          description: "Warrior class",
          rulesetId: originalRuleset.id,
          hd: 10,
        },
      ]);

      const klassLevelsResult1 = await KlassLevels.createMany(db, [
        {
          klassId: klass[0].id,
          level: 1,
        },
      ]);

      await Properties.createMany(db, [
        { entityId: klassLevelsResult1[0].id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "1" },
        { entityId: klassLevelsResult1[0].id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "2" },
      ]);

      // Create feat with modifiers
      const feat = await Feats.createMany(db, [
        {
          name: "Power Attack",
          description: "Trade accuracy for power",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Modifiers.createMany(db, [
        {
          sourceType: "feats",
          sourceId: feat[0].id,
          target: "baseAttackBonus",
          value: "2",
          valueType: "number",
          operator: "add",
        },
      ]);

      await Properties.createMany(db, [
        {
          entityType: "feats",
          entityId: feat[0].id,
          type: "prerequisite",
          value: "Strength 13+",
        },
      ]);

      await Requirements.createMany(db, [
        {
          entityType: "feats",
          entityId: feat[0].id,
          level: "character",
          target: "ability.strength",
          value: "13",
          valueType: "number",
          operator: "greater_than_or_equal",
        },
      ]);

      // Fork the ruleset
      const forkedRuleset = await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked with Customizations", private: false }
      );

      // COW: entities inherited, not copied — verify via parent IDs
      const inheritedKlasses = await Klasses.findAll((pagination) =>
        Klasses.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedKlasses.length).toBe(1);

      // Levels are on the parent klass (inherited)
      const inheritedLevels = await KlassLevels.findManyByKlass(db, {
        klassId: klass[0].id,
      });
      expect(inheritedLevels.length).toBe(1);
      expect(inheritedLevels[0].level).toBe(1);

      // Customizations remain on parent entities (inherited)
      const inheritedFeats = await Feats.findAll((pagination) =>
        Feats.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedFeats.length).toBe(1);

      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [feat[0].id],
        sourceType: "feats",
      });
      expect(parentModifiers.length).toBe(1);
      expect(parentModifiers[0].value).toBe("2");

      const parentProperties = await Properties.findManyByEntity(db, {
        entityIds: [feat[0].id],
        entityType: "feats",
      });
      expect(parentProperties.length).toBe(1);

      const parentRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [feat[0].id],
        entityType: "feats",
      });
      expect(parentRequirements.length).toBe(1);
    });

    test("should use original description if not provided", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const originalRuleset = await createTestRuleset(user.id, {
        description: "Original description to be inherited",
        status: "Published",
      });

      // Add at least one entity of each type to avoid empty array issues
      const descAbility = await createTestAbility(originalRuleset.id);
      await Skills.createMany(db, [
        {
          name: "Description Test Skill",
          description: "Test skill",
          rulesetId: originalRuleset.id,
          primaryAbilityId: descAbility.id,
        },
      ]);

      await Feats.createMany(db, [
        {
          name: "Description Test Feat",
          description: "Test feat",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Powers.createMany(db, [
        {
          name: "Description Test Power",
          description: "Test power",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Items.createMany(db, [
        {
          name: "Description Test Item",
          description: "Test item",
          rulesetId: originalRuleset.id,
        },
      ]);

      await Races.createMany(db, [
        {
          name: "Description Test Race",
          description: "Test race",
          rulesetId: originalRuleset.id,
          size: "Medium",
          baseSpeed: 30,
        },
      ]);

      await Languages.createMany(db, [
        {
          name: "Description Test Language",
          description: "Test language",
          rulesetId: originalRuleset.id,
          type: "Standard",
        },
      ]);

      await Klasses.createMany(db, [
        {
          name: "Description Test Class",
          description: "Test class",
          rulesetId: originalRuleset.id,
          hd: 8,
        },
      ]);

      await Aptitudes.createMany(db, [
        {
          name: "Description Test Aptitude",
          description: "Test aptitude",
          rulesetId: originalRuleset.id,
        },
      ]);

      const forkedRuleset = await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked Ruleset Description Test", private: false }
      );

      expect(forkedRuleset.description).toBe("Original description to be inherited");
    });

    test("should throw UnprocessableEntityError for non-published ruleset", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const draftRuleset = await createTestRuleset(user.id, { status: "Draft" });

      await expect(
        RulesetsMethods.forkRuleset(otherSession, draftRuleset.id, {
          name: "Forked Draft",
          private: false,
        })
      ).rejects.toThrow(UnprocessableEntityError);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUser();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RulesetsMethods.forkRuleset(session, fakeRulesetId, {
          name: "Forked",
          private: false,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("archiveRuleset", () => {
    test("should archive a ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      const archived = await RulesetsMethods.archiveRuleset(
        session,
        ruleset.id
      );

      expect(archived).toBeDefined();
      expect(archived.id).toBe(ruleset.id);
      expect(archived.status).toBe("Archived");
      expect(archived.updatedAt).toBeDefined();
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUser();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RulesetsMethods.archiveRuleset(session, fakeRulesetId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when archiving another user's ruleset", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const ruleset = await createTestRuleset(user.id);

      await expect(
        RulesetsMethods.archiveRuleset(otherSession, ruleset.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when archiving a base ruleset", async () => {
      const { session } = await createTestUser();
      const baseRuleset = await createBaseRuleset();

      await expect(
        RulesetsMethods.archiveRuleset(session, baseRuleset.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("archives a ruleset with an active campaign linked to it", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      await Campaigns.create(db, {
        name: "Active Campaign",
        description: "Uses the ruleset",
        rulesetId: ruleset.id,
      });

      const archived = await RulesetsMethods.archiveRuleset(session, ruleset.id);
      expect(archived.status).toBe("Archived");
    });

    test("archives a ruleset with an active character linked to it", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      const races = await Races.createMany(db, [{
        name: "Test Race",
        description: "Test race",
        rulesetId: ruleset.id,
        size: "Medium",
        baseSpeed: 30,
      }]);

      await Characters.create(db, {
        userId: user.id,
        rulesetId: ruleset.id,
        raceId: races[0].id,
        name: "Active Character",
        xp: 0,
        alignment: "True Neutral",
        age: 25,
        gender: "Male",
        height: "6'0",
        weight: "180 lbs",
      });

      const archived = await RulesetsMethods.archiveRuleset(session, ruleset.id);
      expect(archived.status).toBe("Archived");
    });

    test("does not cascade-archive owned entities or their customizations", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      const aptitudes = await Aptitudes.create(db, {
        name: "Test Aptitude",
        description: "Test",
        rulesetId: ruleset.id,
      });
      const feats = await Feats.create(db, {
        name: "Test Feat",
        description: "Test",
        rulesetId: ruleset.id,
      });
      await FeatsAptitudes.create(db, {
        featId: feats[0].id,
        aptitudeId: aptitudes[0].id,
      });
      await Properties.create(db, {
        entityId: feats[0].id,
        entityType: "feats",
        type: "bonus_type",
        value: "morale",
      });
      await Requirements.create(db, {
        entityId: feats[0].id,
        entityType: "feats",
        level: "character",
        target: "abilities.strength",
        value: "5",
        valueType: "number",
        operator: "greater_than",
      });

      await RulesetsMethods.archiveRuleset(session, ruleset.id);

      // Archive only flips status on the ruleset itself. Owned entities and
      // their customizations stay live so linked characters/campaigns keep
      // resolving them — the ruleset just becomes read-only at the
      // editing UI level.
      const feat = await Feats.findOne(db, { id: feats[0].id });
      expect(feat?.deletedAt).toBeNull();

      const [association] = await db.select().from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.featId, feats[0].id));
      expect(association.deletedAt).toBeNull();

      const [property] = await db.select().from(propertiesInCustomization)
        .where(eq(propertiesInCustomization.entityId, feats[0].id));
      expect(property.deletedAt).toBeNull();

      const [requirement] = await db.select().from(requirementsInCustomization)
        .where(eq(requirementsInCustomization.entityId, feats[0].id));
      expect(requirement.deletedAt).toBeNull();
    });
  });

  describe("publishRuleset", () => {
    // Helper to seed minimum required content for publishing
    async function seedMinimumContent(rulesetId: string) {
      const ability = await createTestAbility(rulesetId);
      await Promise.all([
        Races.create(db, { name: "Test Race", description: "Test", rulesetId, size: "Medium", baseSpeed: 30 }),
        Klasses.create(db, { name: "Test Class", description: "Test", rulesetId, hd: 8 }),
        Skills.create(db, { name: "Test Skill", description: "Test", rulesetId, primaryAbilityId: ability.id }),
        Feats.create(db, { name: "Test Feat", description: "Test", rulesetId }),
      ]);
    }

    test("should publish a draft ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Draft" });
      await seedMinimumContent(ruleset.id);

      const published = await RulesetsMethods.publishRuleset(
        session,
        ruleset.id
      );

      expect(published).toBeDefined();
      expect(published.id).toBe(ruleset.id);
      expect(published.status).toBe("Published");
      expect(published.updatedAt).toBeDefined();
    });

    test("should throw UnprocessableEntityError when publishing with no content", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Draft" });

      const error = await RulesetsMethods.publishRuleset(session, ruleset.id).catch((e) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityError);
      expect(error.message).toContain("race");
      expect(error.message).toContain("class");
      expect(error.message).toContain("skill");
      expect(error.message).toContain("feat");
    });

    test("should list only the missing types in the error", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Draft" });

      // Seed only race and feat — class and skill are missing
      await Races.create(db, { name: "Test Race", description: "Test", rulesetId: ruleset.id, size: "Medium", baseSpeed: 30 });
      await Feats.create(db, { name: "Test Feat", description: "Test", rulesetId: ruleset.id });

      const error = await RulesetsMethods.publishRuleset(session, ruleset.id).catch((e) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityError);
      expect(error.message).toContain("class");
      expect(error.message).toContain("skill");
      expect(error.message).not.toContain("race");
      expect(error.message).not.toContain("feat");
    });

    test("should not count deleted entities", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Draft" });
      await seedMinimumContent(ruleset.id);

      const races = await Races.findManyByRulesetId(db, { rulesetId: ruleset.id }, { limit: 1, page: 1 });
      await Races.delete(db, { id: races.items[0].id });

      const error = await RulesetsMethods.publishRuleset(session, ruleset.id).catch((e) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityError);
      expect(error.message).toContain("race");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUser();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RulesetsMethods.publishRuleset(session, fakeRulesetId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when publishing another user's ruleset", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const ruleset = await createTestRuleset(user.id);

      await expect(
        RulesetsMethods.publishRuleset(otherSession, ruleset.id)
      ).rejects.toThrow();
    });

    test("should throw Error when publishing a base ruleset", async () => {
      const { session } = await createTestUser();
      const baseRuleset = await createBaseRuleset();

      await expect(
        RulesetsMethods.publishRuleset(session, baseRuleset.id)
      ).rejects.toThrow();
    });

    test("should throw Error when publishing already published ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Published" });

      await expect(
        RulesetsMethods.publishRuleset(session, ruleset.id)
      ).rejects.toThrow();
    });

    test("should throw Error when publishing archived ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Archived" });

      await expect(
        RulesetsMethods.publishRuleset(session, ruleset.id)
      ).rejects.toThrow();
    });

    test("should publish a fork as an extension without requiring playable content", async () => {
      const { session } = await createTestUser();
      const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
      if (!base) throw new Error("Base D&D 3.5 ruleset not found — run reset-db");

      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `Extension Fork ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });

      const published = await RulesetsMethods.publishRuleset(session, fork.id, { kind: "extension" });

      expect(published.kind).toBe("extension");
      expect(published.status).toBe("Published");
    });

    test("should reject publishing a non-fork as an extension", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Draft" });

      await expect(
        RulesetsMethods.publishRuleset(session, ruleset.id, { kind: "extension" }),
      ).rejects.toThrow(UnprocessableEntityError);
    });

    test("should reject publishing as extension when fork subscribes to other extensions", async () => {
      const { session } = await createTestUser();
      const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
      if (!base) throw new Error("Base D&D 3.5 ruleset not found — run reset-db");
      const seedExtension = await Rulesets.findOne(db, { name: DND35_COMPLETE_WARRIOR_NAME });
      if (!seedExtension) throw new Error("Seed extension not found — run reset-db");

      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `Mixed Fork ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });
      await RulesetsMethods.subscribeExtension(session, fork.id, [seedExtension.id]);

      await expect(
        RulesetsMethods.publishRuleset(session, fork.id, { kind: "extension" }),
      ).rejects.toThrow(UnprocessableEntityError);
    });
  });

  describe("updateRuleset", () => {
    test("should update ruleset name and description", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, {
        name: "Original Name",
        description: "Original description",
      });

      const updated = await RulesetsMethods.updateRuleset(
        session,
        ruleset.id,
        {
          name: "Updated Name",
          description: "Updated description",
        }
      );

      expect(updated.name).toBe("Updated Name");
      expect(updated.description).toBe("Updated description");
      expect(updated.id).toBe(ruleset.id);
      expect(updated.updatedAt).toBeDefined();
    });

    test("should update ruleset privacy", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { private: true });

      const updated = await RulesetsMethods.updateRuleset(
        session,
        ruleset.id,
        {
          name: ruleset.name,
          description: ruleset.description,
          private: false,
        }
      );

      expect(updated.private).toBe(false);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUser();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RulesetsMethods.updateRuleset(session, fakeRulesetId, {
          name: "Test",
          description: "Test",
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when updating another user's ruleset", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const ruleset = await createTestRuleset(user.id);

      await expect(
        RulesetsMethods.updateRuleset(otherSession, ruleset.id, {
          name: "Updated",
          description: "Updated",
        })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when updating a base ruleset", async () => {
      const { session } = await createTestUser();
      const baseRuleset = await createBaseRuleset();

      await expect(
        RulesetsMethods.updateRuleset(session, baseRuleset.id, {
          name: "Updated",
          description: "Updated",
        })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw UnprocessableEntityError when updating archived ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { status: "Archived" });

      await expect(
        RulesetsMethods.updateRuleset(session, ruleset.id, {
          name: "Updated",
          description: "Updated",
        })
      ).rejects.toThrow(UnprocessableEntityError);
    });
  });

  describe("starRuleset", () => {
    test("should star a published public ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { private: false, status: "Published" });

      await RulesetsMethods.starRuleset(session, ruleset.id);

      const star = await StarredRulesets.findOne(db, {
        userId: session.userId,
        rulesetId: ruleset.id,
      });
      expect(star).toBeDefined();
    });

    test("should throw NotFoundError when starring non-existent ruleset", async () => {
      const { session } = await createTestUser();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RulesetsMethods.starRuleset(session, fakeRulesetId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when starring a draft ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { private: false, status: "Draft" });

      await expect(
        RulesetsMethods.starRuleset(session, ruleset.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when starring a private ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { private: true, status: "Published" });

      await expect(
        RulesetsMethods.starRuleset(session, ruleset.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when starring a user fork published as a ruleset (not an extension)", async () => {
      const { session } = await createTestUser();
      const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
      if (!base) throw new Error("Base D&D 3.5 ruleset not found — run reset-db");

      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `Fork ${Math.random().toString(36).substr(2, 6)}`,
        private: false,
      });
      await RulesetsMethods.publishRuleset(session, fork.id);

      const { session: otherSession } = await createTestUser();
      await expect(
        RulesetsMethods.starRuleset(otherSession, fork.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should star a user fork published as an extension", async () => {
      const { session } = await createTestUser();
      const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
      if (!base) throw new Error("Base D&D 3.5 ruleset not found — run reset-db");

      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `Homebrew ${Math.random().toString(36).substr(2, 6)}`,
        private: false,
      });
      await RulesetsMethods.publishRuleset(session, fork.id, { kind: "extension" });

      const { session: otherSession } = await createTestUser();
      await RulesetsMethods.starRuleset(otherSession, fork.id);

      const star = await StarredRulesets.findOne(db, {
        userId: otherSession.userId,
        rulesetId: fork.id,
      });
      expect(star).toBeDefined();
    });
  });

  describe("unstarRuleset", () => {
    test("should unstar a starred ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { private: false, status: "Published" });

      await RulesetsMethods.starRuleset(session, ruleset.id);
      await RulesetsMethods.unstarRuleset(session, ruleset.id);

      const star = await StarredRulesets.findOne(db, {
        userId: session.userId,
        rulesetId: ruleset.id,
      });
      expect(star).toBeUndefined();
    });

    test("should be idempotent when unstarring a non-starred ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      // Should not throw
      await RulesetsMethods.unstarRuleset(session, ruleset.id);
    });
  });

  describe("isStarred enrichment", () => {
    test("getAllRulesets should include isStarred field", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { private: false, status: "Published" });

      await RulesetsMethods.starRuleset(session, ruleset.id);

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "published" },
        { limit: 100, page: 1 },
      );

      const found = result.items.find((r) => r.id === ruleset.id);
      expect(found).toBeDefined();
      expect(found!.isStarred).toBe(true);
    });

    test("getAllRulesets should return isStarred false for unstarred rulesets", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { private: false, status: "Published" });

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "published" },
        { limit: 100, page: 1 },
      );

      const found = result.items.find((r) => r.id === ruleset.id);
      expect(found).toBeDefined();
      expect(found!.isStarred).toBe(false);
    });

    test("getRulesetById should include isStarred true when starred", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id, { private: false, status: "Published" });

      await RulesetsMethods.starRuleset(session, ruleset.id);

      const result = await RulesetsMethods.getRulesetById(session, ruleset.id);
      expect(result.isStarred).toBe(true);
    });

    test("getRulesetById should include isStarred false when not starred", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      const result = await RulesetsMethods.getRulesetById(session, ruleset.id);
      expect(result.isStarred).toBe(false);
    });

    test("getAllRulesets with starred scope should only return starred rulesets", async () => {
      const { user, session } = await createTestUser();
      const starredRuleset = await createTestRuleset(user.id, { private: false, status: "Published" });
      await createTestRuleset(user.id, { private: false, status: "Published" }); // unstarred

      await RulesetsMethods.starRuleset(session, starredRuleset.id);

      const result = await RulesetsMethods.getAllRulesets(
        session,
        { scope: "starred" },
        { limit: 100, page: 1 },
      );

      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const ids = result.items.map((r) => r.id);
      expect(ids).toContain(starredRuleset.id);
      // All returned items should be starred
      for (const r of result.items) {
        expect(r.isStarred).toBe(true);
      }
    });
  });

  describe("unarchiveRuleset", () => {
    test("should unarchive a ruleset", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      // Archive first
      await RulesetsMethods.archiveRuleset(session, ruleset.id);

      // Then unarchive
      const unarchived = await RulesetsMethods.unarchiveRuleset(session, ruleset.id);

      expect(unarchived).toBeDefined();
      expect(unarchived.id).toBe(ruleset.id);
      expect(unarchived.status).toBe("Draft");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUser();

      await expect(
        RulesetsMethods.unarchiveRuleset(session, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { user, session } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const ruleset = await createTestRuleset(user.id);
      await RulesetsMethods.archiveRuleset(session, ruleset.id);

      await expect(
        RulesetsMethods.unarchiveRuleset(otherSession, ruleset.id),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when ruleset is not archived", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      await expect(
        RulesetsMethods.unarchiveRuleset(session, ruleset.id),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when unarchiving a base ruleset", async () => {
      const { session } = await createTestUser();
      const baseRuleset = await createBaseRuleset();

      await expect(
        RulesetsMethods.unarchiveRuleset(session, baseRuleset.id),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("forkRuleset - saves and skillPointAbility", () => {
    test("should fork ruleset with saves remapped to new ability IDs", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const originalRuleset = await createTestRuleset(user.id, { status: "Published" });

      // Create ability + save that references it
      const ability = await createTestAbility(originalRuleset.id, "Dexterity");
      const saves = await Saves.create(db, {
        name: "Reflex",
        description: "Dodge and evade",
        abilityId: ability.id,
        rulesetId: originalRuleset.id,
      });

      // Create class with level and klass_level_saves
      const klasses = await Klasses.createMany(db, [{
        name: "Rogue",
        description: "Sneaky",
        rulesetId: originalRuleset.id,
        hd: 6,
      }]);
      const klassLevels = await KlassLevels.createMany(db, [{
        klassId: klasses[0].id,
        level: 1,
      }]);

      await Properties.createMany(db, [
        { entityId: klassLevels[0].id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "0" },
        { entityId: klassLevels[0].id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "8" },
      ]);

      await KlassLevelSaves.createMany(db, [{
        klassLevelId: klassLevels[0].id,
        saveId: saves[0].id,
        base: 2,
      }]);

      // Add required entities
      await Skills.createMany(db, [{
        name: "Stealth",
        description: "Hide",
        rulesetId: originalRuleset.id,
        primaryAbilityId: ability.id,
      }]);
      await Feats.createMany(db, [{ name: "Lightning Reflexes", description: "Bonus", rulesetId: originalRuleset.id }]);
      await Powers.createMany(db, [{ name: "Sneak Attack", description: "Extra damage", rulesetId: originalRuleset.id }]);
      await Items.createMany(db, [{ name: "Test Blade", description: "A blade", rulesetId: originalRuleset.id }]);
      await Races.createMany(db, [{ name: "Halfling", description: "Small", rulesetId: originalRuleset.id, size: "Small", baseSpeed: 20 }]);
      await Languages.createMany(db, [{ name: "Halfling", description: "Halfling tongue", rulesetId: originalRuleset.id, type: "Standard" }]);
      await Aptitudes.createMany(db, [{ name: "General", description: "General feats", rulesetId: originalRuleset.id }]);

      // Fork the ruleset
      const forkedRuleset = await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked with Saves", private: false },
      );

      // COW: saves inherited with original parent IDs (resolveOverrides handles at read time)
      const inheritedSaves = await Saves.findAll((pagination) =>
        Saves.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedSaves.length).toBe(1);
      expect(inheritedSaves[0].name).toBe("Reflex");
      expect(inheritedSaves[0].id).toBe(saves[0].id); // Same ID (inherited)
      expect(inheritedSaves[0].abilityId).toBe(ability.id); // Original FK (resolved at read time)

      // Klass levels stay on parent klass (inherited)
      const inheritedLevels = await KlassLevels.findManyByKlass(db, { klassId: klasses[0].id });
      const inheritedKlsSaves = await KlassLevelSaves.findMany(db, { klassLevelIds: [inheritedLevels[0].id] });
      expect(inheritedKlsSaves.length).toBe(1);
      expect(inheritedKlsSaves[0].saveId).toBe(saves[0].id); // Original FK
      expect(inheritedKlsSaves[0].base).toBe(2);
    });

    test("should fork ruleset with klass_level_feats remapped", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const originalRuleset = await createTestRuleset(user.id, { status: "Published" });

      const ability = await createTestAbility(originalRuleset.id, "Strength");

      // Create aptitude + feat
      const aptitude = await Aptitudes.createMany(db, [{
        name: "Fighter Bonus Feat",
        description: "Fighter bonus feats",
        rulesetId: originalRuleset.id,
      }]);
      const feat = await Feats.createMany(db, [{
        name: "Power Attack",
        description: "Trade accuracy for power",
        rulesetId: originalRuleset.id,
      }]);

      // Create class with level
      const klasses = await Klasses.createMany(db, [{
        name: "Fighter",
        description: "Warrior",
        rulesetId: originalRuleset.id,
        hd: 10,
      }]);
      const klassLevels = await KlassLevels.createMany(db, [{
        klassId: klasses[0].id,
        level: 1,
      }]);

      await Properties.createMany(db, [
        { entityId: klassLevels[0].id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "1" },
        { entityId: klassLevels[0].id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "2" },
      ]);

      // Link feat to klass level
      await KlassLevelFeats.createMany(db, [{
        klassLevelId: klassLevels[0].id,
        featId: feat[0].id,
        aptitudeId: aptitude[0].id,
        free: true,
      }]);

      // Add required entities
      await Skills.createMany(db, [{
        name: "Climb",
        description: "Climb surfaces",
        rulesetId: originalRuleset.id,
        primaryAbilityId: ability.id,
      }]);
      await Powers.createMany(db, [{ name: "Test Power", description: "Test", rulesetId: originalRuleset.id }]);
      await Items.createMany(db, [{ name: "Test Blade", description: "A blade", rulesetId: originalRuleset.id }]);
      await Races.createMany(db, [{ name: "Human", description: "Adaptable", rulesetId: originalRuleset.id, size: "Medium", baseSpeed: 30 }]);
      await Languages.createMany(db, [{ name: "Common", description: "Common tongue", rulesetId: originalRuleset.id, type: "Standard" }]);
      await Saves.create(db, { name: "Fortitude", description: "Fort save", abilityId: ability.id, rulesetId: originalRuleset.id });

      // Fork
      await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked with KlassLevelFeats", private: false },
      );

      // COW: klass level feats stay on parent entities (inherited, not remapped)
      const inheritedLevels = await KlassLevels.findManyByKlass(db, { klassId: klasses[0].id });
      expect(inheritedLevels.length).toBe(1);

      const inheritedKlf = await KlassLevelFeats.findMany(db, { klassLevelIds: [inheritedLevels[0].id] });
      expect(inheritedKlf.length).toBe(1);
      expect(inheritedKlf[0].free).toBe(true);

      // IDs remain as parent's (resolved at read time)
      expect(inheritedKlf[0].klassLevelId).toBe(klassLevels[0].id);
      expect(inheritedKlf[0].featId).toBe(feat[0].id);
      expect(inheritedKlf[0].aptitudeId).toBe(aptitude[0].id);
    });

    test("should fork ruleset with klass_level_powers remapped", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const originalRuleset = await createTestRuleset(user.id, { status: "Published" });

      const ability = await createTestAbility(originalRuleset.id, "Wisdom");

      // Create aptitude + power
      const aptitude = await Aptitudes.createMany(db, [{
        name: "Rogue Special Ability",
        description: "Rogue special abilities",
        rulesetId: originalRuleset.id,
      }]);
      const power = await Powers.createMany(db, [{
        name: "Crippling Strike",
        description: "Weaken foes",
        rulesetId: originalRuleset.id,
      }]);

      // Create class with level
      const klasses = await Klasses.createMany(db, [{
        name: "Rogue",
        description: "Sneaky",
        rulesetId: originalRuleset.id,
        hd: 6,
      }]);
      const klassLevels = await KlassLevels.createMany(db, [{
        klassId: klasses[0].id,
        level: 10,
      }]);

      await Properties.createMany(db, [
        { entityId: klassLevels[0].id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "7" },
        { entityId: klassLevels[0].id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "8" },
      ]);

      // Link power to klass level
      await KlassLevelPowers.createMany(db, [{
        klassLevelId: klassLevels[0].id,
        powerId: power[0].id,
        aptitudeId: aptitude[0].id,
        free: false,
      }]);

      // Add required entities
      await Skills.createMany(db, [{
        name: "Hide",
        description: "Stay hidden",
        rulesetId: originalRuleset.id,
        primaryAbilityId: ability.id,
      }]);
      await Feats.createMany(db, [{ name: "Improved Initiative", description: "Go first", rulesetId: originalRuleset.id }]);
      await Items.createMany(db, [{ name: "Test Blade", description: "A blade", rulesetId: originalRuleset.id }]);
      await Races.createMany(db, [{ name: "Halfling", description: "Small", rulesetId: originalRuleset.id, size: "Small", baseSpeed: 20 }]);
      await Languages.createMany(db, [{ name: "Halfling", description: "Halfling tongue", rulesetId: originalRuleset.id, type: "Standard" }]);
      await Saves.create(db, { name: "Reflex", description: "Dodge", abilityId: ability.id, rulesetId: originalRuleset.id });

      // Fork
      await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked with KlassLevelPowers", private: false },
      );

      // COW: klass level powers stay on parent entities (inherited, not remapped)
      const inheritedLevels = await KlassLevels.findManyByKlass(db, { klassId: klasses[0].id });
      expect(inheritedLevels.length).toBe(1);

      const inheritedKlp = await KlassLevelPowers.findMany(db, { klassLevelIds: [inheritedLevels[0].id] });
      expect(inheritedKlp.length).toBe(1);
      expect(inheritedKlp[0].free).toBe(false);

      // IDs remain as parent's (resolved at read time)
      expect(inheritedKlp[0].klassLevelId).toBe(klassLevels[0].id);
      expect(inheritedKlp[0].powerId).toBe(power[0].id);
      expect(inheritedKlp[0].aptitudeId).toBe(aptitude[0].id);
    });

    test("should fork ruleset with skill point ability property remapped", async () => {
      const { session } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      // Create ruleset with auto-seeded abilities
      const ruleset = await createTestRuleset(session.userId, {
        name: "Ruleset with SkillPointAbility",
        description: "Test",
      });
      const rulesetModule = RulesetFactory.fromBaseRules("Dungeons & Dragons: 3.5");
      await rulesetModule.seedRuleset(db, ruleset.id);

      // Verify the source ruleset has skill point ability property set
      const sourceProps = await Properties.findManyByEntity(db, {
        entityIds: [ruleset.id],
        entityType: "rulesets",
      });
      const sourceProp = sourceProps.find((p) => p.type === RULESET_SKILL_POINT_ABILITY_ID);
      expect(sourceProp).toBeDefined();

      // Add remaining entity types to avoid empty array issues
      const seededAbilities = await Abilities.findAll((pagination) =>
        Abilities.findManyByRulesetId(db, { rulesetId: ruleset.id }, pagination),
      );
      await Skills.createMany(db, [{ name: "Test Skill", description: "Test", rulesetId: ruleset.id, primaryAbilityId: seededAbilities[0].id }]);
      await Feats.createMany(db, [{ name: "Test Feat", description: "Test", rulesetId: ruleset.id }]);
      await Powers.createMany(db, [{ name: "Test Power", description: "Test", rulesetId: ruleset.id }]);
      await Items.createMany(db, [{ name: "Test Item", description: "Test", rulesetId: ruleset.id }]);
      await Races.createMany(db, [{ name: "Human", description: "Adaptable", rulesetId: ruleset.id, size: "Medium", baseSpeed: 30 }]);
      await Languages.createMany(db, [{ name: "Common", description: "Common tongue", rulesetId: ruleset.id, type: "Standard" }]);
      await Klasses.createMany(db, [{ name: "Fighter", description: "Warrior", rulesetId: ruleset.id, hd: 10 }]);
      await Aptitudes.createMany(db, [{ name: "General", description: "General feats", rulesetId: ruleset.id }]);

      // Publish so it can be forked
      await RulesetsMethods.publishRuleset(session, ruleset.id);

      // Fork the ruleset
      const forkedRuleset = await RulesetsMethods.forkRuleset(
        otherSession,
        ruleset.id,
        { name: "Forked with SkillPointAbility", private: false },
      );

      // COW: properties copied as-is with parent ability ID (resolveOverrides at read time)
      const forkedProps = await Properties.findManyByEntity(db, {
        entityIds: [forkedRuleset.id],
        entityType: "rulesets",
      });
      const forkedProp = forkedProps.find((p) => p.type === RULESET_SKILL_POINT_ABILITY_ID);
      expect(forkedProp).toBeDefined();
      // Value is the parent's ability ID (not remapped — resolveOverrides handles at read time)
      expect(forkedProp!.value).toBe(sourceProp!.value);
    });

    test("should fork ruleset with power-aptitude relationships", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const originalRuleset = await createTestRuleset(user.id, { status: "Published" });

      const ability = await createTestAbility(originalRuleset.id);
      await Skills.createMany(db, [{
        name: "Test Skill",
        description: "Test",
        rulesetId: originalRuleset.id,
        primaryAbilityId: ability.id,
      }]);

      const aptitude = await Aptitudes.createMany(db, [{
        name: "Special Abilities",
        description: "Rogue special abilities",
        rulesetId: originalRuleset.id,
      }]);

      const power = await Powers.createMany(db, [{
        name: "Sneak Attack",
        description: "Extra damage",
        rulesetId: originalRuleset.id,
      }]);

      await PowersAptitudes.createMany(db, [{
        powerId: power[0].id,
        aptitudeId: aptitude[0].id,
      }]);

      await Feats.createMany(db, [{ name: "Test Feat", description: "Test", rulesetId: originalRuleset.id }]);
      await Items.createMany(db, [{ name: "Test Item", description: "Test", rulesetId: originalRuleset.id }]);
      await Races.createMany(db, [{ name: "Human", description: "Adaptable", rulesetId: originalRuleset.id, size: "Medium", baseSpeed: 30 }]);
      await Languages.createMany(db, [{ name: "Common", description: "Common tongue", rulesetId: originalRuleset.id, type: "Standard" }]);
      await Klasses.createMany(db, [{ name: "Rogue", description: "Sneaky", rulesetId: originalRuleset.id, hd: 6 }]);

      const forkedRuleset = await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked with Power Aptitudes", private: false },
      );

      // COW: power-aptitude relationships stay on parent entities (inherited)
      const inheritedPowers = await Powers.findAll((pagination) =>
        Powers.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedPowers.length).toBe(1);

      const parentPowerAptitudes = await PowersAptitudes.findMany(db, {
        powerIds: [power[0].id],
      });
      expect(parentPowerAptitudes.length).toBe(1);
    });

    test("should fork ruleset with customizations on all entity types", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const originalRuleset = await createTestRuleset(user.id, { status: "Published" });

      // Create base entities
      const ability = await createTestAbility(originalRuleset.id);
      await Skills.createMany(db, [{
        name: "Test Skill",
        description: "Test",
        rulesetId: originalRuleset.id,
        primaryAbilityId: ability.id,
      }]);
      await Races.createMany(db, [{ name: "Human", description: "Adaptable", rulesetId: originalRuleset.id, size: "Medium", baseSpeed: 30 }]);
      await Languages.createMany(db, [{ name: "Common", description: "Common tongue", rulesetId: originalRuleset.id, type: "Standard" }]);
      await Aptitudes.createMany(db, [{ name: "General", description: "General feats", rulesetId: originalRuleset.id }]);

      // Create feat with modifier, property, requirement
      const feat = await Feats.createMany(db, [{ name: "Power Attack", description: "Trade accuracy", rulesetId: originalRuleset.id }]);

      // Create power with modifier, property, requirement
      const power = await Powers.createMany(db, [{ name: "Sneak Attack", description: "Extra damage", rulesetId: originalRuleset.id }]);

      // Create item with modifier, property, requirement
      const item = await Items.createMany(db, [{ name: "Test Blade", description: "A blade", rulesetId: originalRuleset.id }]);

      // Create class with level
      const klass = await Klasses.createMany(db, [{ name: "Fighter", description: "Warrior", rulesetId: originalRuleset.id, hd: 10 }]);
      const klassLevel = await KlassLevels.createMany(db, [{ klassId: klass[0].id, level: 1 }]);

      await Properties.createMany(db, [
        { entityId: klassLevel[0].id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "1" },
        { entityId: klassLevel[0].id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "2" },
      ]);

      // Add modifiers for all entity types
      await Modifiers.createMany(db, [
        { sourceType: "feats", sourceId: feat[0].id, target: "baseAttackBonus", value: "2", valueType: "number", operator: "add" },
        { sourceType: "powers", sourceId: power[0].id, target: "damage", value: "1", valueType: "number", operator: "add" },
        { sourceType: "items", sourceId: item[0].id, target: "baseAttackBonus", value: "1", valueType: "number", operator: "add" },
        { sourceType: "klass_levels", sourceId: klassLevel[0].id, target: "fortitude", value: "2", valueType: "number", operator: "add" },
      ]);

      // Add properties for all entity types
      await Properties.createMany(db, [
        { entityType: "feats", entityId: feat[0].id, type: "prerequisite", value: "Str 13+" },
        { entityType: "powers", entityId: power[0].id, type: "prerequisite", value: "Rogue level 1" },
        { entityType: "items", entityId: item[0].id, type: "WEAPON_PROFICIENCY", value: "Martial" },
        { entityType: "klass_levels", entityId: klassLevel[0].id, type: "special", value: "Bonus Feat" },
      ]);

      // Add requirements for all entity types
      await Requirements.createMany(db, [
        { entityType: "feats", entityId: feat[0].id, level: "character", target: "ability.strength", value: "13", valueType: "number", operator: "greater_than_or_equal" },
        { entityType: "powers", entityId: power[0].id, level: "character", target: "class.rogue", value: "1", valueType: "number", operator: "greater_than_or_equal" },
        { entityType: "items", entityId: item[0].id, level: "character", target: "baseAttackBonus", value: "1", valueType: "number", operator: "greater_than_or_equal" },
        { entityType: "klass_levels", entityId: klassLevel[0].id, level: "character", target: "level", value: "1", valueType: "number", operator: "greater_than_or_equal" },
      ]);

      // Fork the ruleset
      await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked with All Customizations", private: false },
      );

      // COW: customizations stay on parent entities (inherited, not copied)
      // Verify modifiers on parent entity IDs
      const [fMods, pMods, iMods, klMods] = await Promise.all([
        Modifiers.findManyBySource(db, { sourceIds: [feat[0].id], sourceType: "feats" }),
        Modifiers.findManyBySource(db, { sourceIds: [power[0].id], sourceType: "powers" }),
        Modifiers.findManyBySource(db, { sourceIds: [item[0].id], sourceType: "items" }),
        Modifiers.findManyBySource(db, { sourceIds: [klassLevel[0].id], sourceType: "klass_levels" }),
      ]);
      expect(fMods.length).toBe(1);
      expect(pMods.length).toBe(1);
      expect(iMods.length).toBe(1);
      expect(klMods.length).toBe(1);

      // Verify properties on parent entity IDs
      const [fProps, pProps, iProps, klProps] = await Promise.all([
        Properties.findManyByEntity(db, { entityIds: [feat[0].id], entityType: "feats" }),
        Properties.findManyByEntity(db, { entityIds: [power[0].id], entityType: "powers" }),
        Properties.findManyByEntity(db, { entityIds: [item[0].id], entityType: "items" }),
        Properties.findManyByEntity(db, { entityIds: [klassLevel[0].id], entityType: "klass_levels" }),
      ]);
      expect(fProps.length).toBe(1);
      expect(pProps.length).toBe(1);
      expect(iProps.length).toBe(1);
      expect(klProps.length).toBe(3);

      // Verify requirements on parent entity IDs
      const [fReqs, pReqs, iReqs, klReqs] = await Promise.all([
        Requirements.findManyByEntity(db, { entityIds: [feat[0].id], entityType: "feats" }),
        Requirements.findManyByEntity(db, { entityIds: [power[0].id], entityType: "powers" }),
        Requirements.findManyByEntity(db, { entityIds: [item[0].id], entityType: "items" }),
        Requirements.findManyByEntity(db, { entityIds: [klassLevel[0].id], entityType: "klass_levels" }),
      ]);
      expect(fReqs.length).toBe(1);
      expect(pReqs.length).toBe(1);
      expect(iReqs.length).toBe(1);
      expect(klReqs.length).toBe(1);
    });
  });

  describe("forkRuleset - snapshots", () => {
    test("COW fork should have zero snapshots (snapshots only created on write)", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const originalRuleset = await createTestRuleset(user.id, { status: "Published" });

      const ability = await createTestAbility(originalRuleset.id);
      await Skills.createMany(db, [{ name: "Climb", description: "Climb surfaces", rulesetId: originalRuleset.id, primaryAbilityId: ability.id }]);
      await Feats.createMany(db, [{ name: "Power Attack", description: "Trade accuracy", rulesetId: originalRuleset.id }]);
      await Powers.createMany(db, [{ name: "Sneak Attack", description: "Extra damage", rulesetId: originalRuleset.id }]);
      await Items.createMany(db, [{ name: "Sword", description: "A blade", rulesetId: originalRuleset.id }]);
      await Races.createMany(db, [{ name: "Human", description: "Adaptable", rulesetId: originalRuleset.id, size: "Medium", baseSpeed: 30 }]);
      await Languages.createMany(db, [{ name: "Common", description: "Common tongue", rulesetId: originalRuleset.id, type: "Standard" }]);
      await Klasses.createMany(db, [{ name: "Fighter", description: "Warrior", rulesetId: originalRuleset.id, hd: 10 }]);
      await Aptitudes.createMany(db, [{ name: "General", description: "General feats", rulesetId: originalRuleset.id }]);

      const forkedRuleset = await RulesetsMethods.forkRuleset(
        otherSession,
        originalRuleset.id,
        { name: "Forked with Snapshots", private: false },
      );

      // COW: zero snapshots on fresh fork (entities are inherited, not copied)
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: forkedRuleset.id });
      expect(snapshots.length).toBe(0);

      // COW: entities are accessible via inheritance
      const inheritedFeats = await Feats.findAll((pagination) =>
        Feats.findManyByRulesetId(db, { rulesetId: forkedRuleset.id, ancestorRulesetIds: [originalRuleset.id] }, pagination),
      );
      expect(inheritedFeats.length).toBe(1);
    });
  });

  describe("modifier requirements", () => {
    // Helper: creates a parent with a feat that has a modifier with requirements on that modifier
    async function setupModifierRequirements() {
      const { user: owner } = await createTestUser();
      const ownerSession = createTestSession(owner.id);

      const parent = await createTestRuleset(owner.id, { status: "Published" });

      const feats = await Feats.createMany(db, [
        { name: "Domain Spells", description: "Domain spell access", rulesetId: parent.id },
      ]);

      const klasses = await Klasses.createMany(db, [
        { name: "Cleric", description: "Divine caster", rulesetId: parent.id, hd: 8 },
      ]);
      const levels = await KlassLevels.createMany(db, [
        { klassId: klasses[0].id, level: 1 },
        { klassId: klasses[0].id, level: 3 },
      ]);
      await Properties.createMany(db, [
        { entityId: levels[0].id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "0" },
        { entityId: levels[0].id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "2" },
        { entityId: levels[1].id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "1" },
        { entityId: levels[1].id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "2" },
      ]);

      // Create modifiers on the feat
      const featModifiers = await Modifiers.createMany(db, [
        { sourceType: "feats", sourceId: feats[0].id, target: "spellSlots", value: "1", valueType: "number", operator: "add" },
        { sourceType: "feats", sourceId: feats[0].id, target: "spellDc", value: "2", valueType: "number", operator: "add" },
      ]);

      // Create a modifier on the klass level
      const levelModifiers = await Modifiers.createMany(db, [
        { sourceType: "klass_levels", sourceId: levels[1].id, target: "fortitude", value: "1", valueType: "number", operator: "add" },
      ]);

      // Attach requirements to the modifiers (e.g., "only applies if cleric level >= 3")
      const modifierReqs = await Requirements.createMany(db, [
        {
          entityType: "modifiers",
          entityId: featModifiers[0].id,
          level: "character",
          target: "class.cleric",
          value: "3",
          valueType: "number",
          operator: "greater_than_or_equal",
        },
        {
          entityType: "modifiers",
          entityId: featModifiers[1].id,
          level: "character",
          target: "class.cleric",
          value: "5",
          valueType: "number",
          operator: "greater_than_or_equal",
        },
        {
          entityType: "modifiers",
          entityId: levelModifiers[0].id,
          level: "character",
          target: "level",
          value: "3",
          valueType: "number",
          operator: "greater_than_or_equal",
        },
      ]);

      // Also add regular entity requirements
      await Requirements.createMany(db, [
        { entityType: "feats", entityId: feats[0].id, level: "character", target: "class.cleric", value: "1", valueType: "number", operator: "greater_than_or_equal" },
      ]);

      return {
        parent,
        ownerSession,
        feats,
        klasses,
        levels,
        featModifiers,
        levelModifiers,
        modifierReqs,
      };
    }

    test("fetchEntityCustomizations should include modifier requirements", async () => {
      const { feats, featModifiers } = await setupModifierRequirements();

      const custMap = await fetchEntityCustomizations(db, [feats[0].id], "feats", "feats");
      const cust = custMap.get(feats[0].id)!;

      expect(cust.modifiers.length).toBe(2);
      expect(cust.requirements.length).toBe(1); // Regular feat requirement
      expect(cust.modifierRequirements.length).toBe(2); // Requirements on feat modifiers

      // Verify the modifier requirements reference the correct modifier IDs
      const modReqEntityIds = cust.modifierRequirements.map((r) => r.entityId).sort();
      const expectedIds = [featModifiers[0].id, featModifiers[1].id].sort();
      expect(modReqEntityIds).toEqual(expectedIds);

      // Verify the modifier requirement values
      const req1 = cust.modifierRequirements.find((r) => r.entityId === featModifiers[0].id)!;
      expect(req1.target).toBe("class.cleric");
      expect(req1.value).toBe("3");
    });

    test("fetchEntityCustomizations should include klass_level modifier requirements", async () => {
      const { levels, levelModifiers } = await setupModifierRequirements();

      const custMap = await fetchEntityCustomizations(db, [levels[1].id], "klass_levels", "klass_levels");
      const cust = custMap.get(levels[1].id)!;

      expect(cust.modifiers.length).toBe(1);
      expect(cust.modifierRequirements.length).toBe(1);
      expect(cust.modifierRequirements[0].entityId).toBe(levelModifiers[0].id);
      expect(cust.modifierRequirements[0].value).toBe("3");
    });

    test("COW should copy modifier requirements when forking an entity", async () => {
      const { parent, feats, featModifiers } = await setupModifierRequirements();
      const { session: childSession } = await createTestUser();

      // Fork the ruleset
      const child = await RulesetsMethods.forkRuleset(
        childSession, parent.id, { name: "Modifier Req Fork", private: false },
      );

      // COW the feat into the child
      const cowResult = await cowEntity(db, "feats", feats[0].id, child.id);

      // Verify modifier requirements were copied to the new entity's modifiers
      const newModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [cowResult.id as string],
        sourceType: "feats",
      });
      expect(newModifiers.length).toBe(2);

      // Fetch modifier requirements on the new modifiers
      const newModifierIds = newModifiers.map((m) => m.id);
      const newModifierReqs = await Requirements.findManyByEntity(db, {
        entityIds: newModifierIds,
        entityType: "modifiers",
      });
      expect(newModifierReqs.length).toBe(2);

      // Verify the modifier requirements point to the NEW modifier IDs (not the old ones)
      for (const req of newModifierReqs) {
        expect(newModifierIds).toContain(req.entityId);
        expect([featModifiers[0].id, featModifiers[1].id]).not.toContain(req.entityId);
      }

      // Verify the requirement content was preserved
      const req3 = newModifierReqs.find((r) => r.value === "3")!;
      expect(req3.target).toBe("class.cleric");
      const req5 = newModifierReqs.find((r) => r.value === "5")!;
      expect(req5.target).toBe("class.cleric");
    });

    test("COW should copy klass level modifier requirements when forking a klass", async () => {
      const { parent, klasses, levelModifiers } = await setupModifierRequirements();
      const { session: childSession } = await createTestUser();

      const child = await RulesetsMethods.forkRuleset(
        childSession, parent.id, { name: "Klass Modifier Req Fork", private: false },
      );

      // COW the klass (copies all levels and their customizations)
      const cowResult = await cowEntity(db, "klasses", klasses[0].id, child.id);

      // Find the new level 3 (corresponds to old levels[1])
      const newLevels = await KlassLevels.findManyByKlass(db, { klassId: cowResult.id as string });
      const newLevel3 = newLevels.find((l) => l.level === 3)!;
      expect(newLevel3).toBeDefined();

      // Verify modifier requirements on the new level's modifiers
      const newLevelModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [newLevel3.id],
        sourceType: "klass_levels",
      });
      expect(newLevelModifiers.length).toBe(1);

      const newLevelModReqs = await Requirements.findManyByEntity(db, {
        entityIds: [newLevelModifiers[0].id],
        entityType: "modifiers",
      });
      expect(newLevelModReqs.length).toBe(1);

      // Verify the requirement points to the NEW modifier ID
      expect(newLevelModReqs[0].entityId).toBe(newLevelModifiers[0].id);
      expect(newLevelModReqs[0].entityId).not.toBe(levelModifiers[0].id);
      expect(newLevelModReqs[0].value).toBe("3");
    });

    test("deleteModifiersWithCascade should delete modifier requirements", async () => {
      const { feats, featModifiers } = await setupModifierRequirements();

      // Verify modifier requirements exist before deletion
      const reqsBefore = await Requirements.findManyByEntity(db, {
        entityIds: featModifiers.map((m) => m.id),
        entityType: "modifiers",
      });
      expect(reqsBefore.length).toBe(2);

      // Delete modifiers with cascade
      await deleteModifiersWithCascade(db, { sourceIds: [feats[0].id], sourceType: "feats" });

      // Verify modifiers are deleted
      const modsAfter = await Modifiers.findManyBySource(db, {
        sourceIds: [feats[0].id],
        sourceType: "feats",
      });
      expect(modsAfter.length).toBe(0);

      // Verify modifier requirements are also deleted (not orphaned)
      const reqsAfter = await Requirements.findManyByEntity(db, {
        entityIds: featModifiers.map((m) => m.id),
        entityType: "modifiers",
      });
      expect(reqsAfter.length).toBe(0);
    });

    test("cowEntityForCustomization should COW parent entity for modifier and return new modifier ID", async () => {
      const { parent, featModifiers } = await setupModifierRequirements();
      const { session: childSession } = await createTestUser();

      const child = await RulesetsMethods.forkRuleset(
        childSession, parent.id, { name: "Cow Modifier Fork", private: false },
      );

      // cowEntityForCustomization for a modifier should COW its parent feat and return the new modifier ID
      const newModifierId = await cowEntityForCustomization(
        db, child.id, "modifiers", featModifiers[0].id,
      );

      // Should return a different modifier ID (the one on the COW'd entity)
      expect(newModifierId).not.toBe(featModifiers[0].id);

      // The new modifier should exist and have the same properties
      const newModifier = await Modifiers.findOne(db, { id: newModifierId });
      expect(newModifier).toBeDefined();
      expect(newModifier!.target).toBe("spellSlots");
      expect(newModifier!.value).toBe("1");

      // The COW'd feat should exist in the child ruleset
      const childFeats = await Feats.findAll((p) =>
        Feats.findManyByRulesetId(db, { rulesetId: child.id }, p),
      );
      expect(childFeats.some((f) => f.name === "Domain Spells")).toBe(true);

      // The new modifier should have its requirements copied too
      const newModReqs = await Requirements.findManyByEntity(db, {
        entityIds: [newModifierId],
        entityType: "modifiers",
      });
      expect(newModReqs.length).toBe(1);
      expect(newModReqs[0].target).toBe("class.cleric");
      expect(newModReqs[0].value).toBe("3");
    });

    test("cowEntityForCustomization should COW parent klass for klass_level modifier and return new modifier ID", async () => {
      const { parent, levelModifiers } = await setupModifierRequirements();
      const { session: childSession } = await createTestUser();

      const child = await RulesetsMethods.forkRuleset(
        childSession, parent.id, { name: "Cow Level Modifier Fork", private: false },
      );

      // cowEntityForCustomization for a klass_level modifier should COW the klass
      const newModifierId = await cowEntityForCustomization(
        db, child.id, "modifiers", levelModifiers[0].id,
      );

      expect(newModifierId).not.toBe(levelModifiers[0].id);

      const newModifier = await Modifiers.findOne(db, { id: newModifierId });
      expect(newModifier).toBeDefined();
      expect(newModifier!.target).toBe("fortitude");
      expect(newModifier!.value).toBe("1");

      // Verify the klass was COW'd
      const childKlasses = await Klasses.findAll((p) =>
        Klasses.findManyByRulesetId(db, { rulesetId: child.id }, p),
      );
      expect(childKlasses.some((k) => k.name === "Cleric")).toBe(true);
    });

    test("cowEntityForCustomization should return entityId unchanged for owned modifier", async () => {
      const { parent, feats } = await setupModifierRequirements();

      // Creating a modifier on an entity owned by the same ruleset — no COW needed
      const ownedModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [feats[0].id],
        sourceType: "feats",
      });

      const result = await cowEntityForCustomization(
        db, parent.id, "modifiers", ownedModifiers[0].id,
      );

      // Should return the same ID since the entity is already owned
      expect(result).toBe(ownedModifiers[0].id);
    });
  });

  describe("getChanges", () => {
    test("empty fork returns empty array", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      await Feats.createMany(db, [{ name: "Test Feat", description: "desc", rulesetId: parent.id }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Empty Fork", private: false },
      );

      const changes = await RulesetsMethods.getChanges(forkSession, fork.id);
      expect(changes).toEqual([]);
    });

    test("modified entity appears with status modified", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const feats = await Feats.createMany(db, [{ name: "Power Attack", description: "Trade accuracy", rulesetId: parent.id }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Modified Fork", private: false },
      );

      // COW the feat and modify it
      const cowResult = await cowEntity(db, "feats", feats[0].id, fork.id);
      await Feats.update(db, { description: "Modified description" }, { id: cowResult.id as string });

      const changes = await RulesetsMethods.getChanges(forkSession, fork.id);
      expect(changes.length).toBe(1);
      const change = changes[0];
      expect(change.entityType).toBe("feats");
      expect(change.name).toBe("Power Attack");
      expect(change.status).toBe("modified");
      if (change.status === "modified") {
        expect(change.sourceEntityId).toBe(feats[0].id);
      }
    });

    test("deleted entity appears with status deleted", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const feats = await Feats.createMany(db, [{ name: "Cleave", description: "Hit adjacent", rulesetId: parent.id }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Deleted Fork", private: false },
      );

      // Delete the inherited feat (COWs + archives)
      await FeatsMethods.deleteRulesetFeat(forkSession, fork.id, feats[0].id);

      const changes = await RulesetsMethods.getChanges(forkSession, fork.id);
      expect(changes.length).toBe(1);
      const change = changes[0];
      expect(change.entityType).toBe("feats");
      expect(change.name).toBe("Cleave");
      expect(change.status).toBe("deleted");
      if (change.status === "deleted") {
        expect(change.sourceEntityId).toBe(feats[0].id);
      }
    });

    test("locally-created entity appears with status added", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      await Feats.createMany(db, [{ name: "Cleave", description: "Hit adjacent", rulesetId: parent.id }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Added Fork", private: false },
      );

      // Create a brand-new feat in the fork (not a COW of an inherited one)
      const localFeats = await Feats.create(db, {
        name: "Custom Fork Feat",
        description: "fork-only",
        rulesetId: fork.id,
      });

      const changes = await RulesetsMethods.getChanges(forkSession, fork.id);
      expect(changes.length).toBe(1);
      const change = changes[0];
      expect(change.entityType).toBe("feats");
      expect(change.name).toBe("Custom Fork Feat");
      expect(change.status).toBe("added");
      if (change.status === "added") {
        expect(change.entityId).toBe(localFeats[0].id);
      }
    });

    test("added and modified appear together in the same response", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const parentFeats = await Feats.createMany(db, [
        { name: "Power Attack", description: "Trade accuracy", rulesetId: parent.id },
      ]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Mixed Fork", private: false },
      );

      // 1. Modify an inherited feat (creates COW + snapshot)
      const cowResult = await cowEntity(db, "feats", parentFeats[0].id, fork.id);
      await Feats.update(db, { description: "Modified" }, { id: cowResult.id as string });

      // 2. Create a new feat locally (no snapshot)
      await Feats.create(db, {
        name: "Brand New",
        description: "fork-only",
        rulesetId: fork.id,
      });

      const changes = await RulesetsMethods.getChanges(forkSession, fork.id);
      expect(changes.length).toBe(2);
      const statuses = changes.map((c) => c.status).sort();
      expect(statuses).toEqual(["added", "modified"]);
    });

    test("non-fork throws BadRequestError", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);

      await expect(
        RulesetsMethods.getChanges(session, ruleset.id),
      ).rejects.toThrow(BadRequestError);
    });

    test("non-owner on private fork throws ForbiddenError", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      await Feats.createMany(db, [{ name: "Test", description: "desc", rulesetId: parent.id }]);

      const fork = await RulesetsMethods.forkRuleset(
        createTestSession(user.id), parent.id, { name: "Owner Fork", private: true },
      );

      await expect(
        RulesetsMethods.getChanges(otherSession, fork.id),
      ).rejects.toThrow(ForbiddenError);
    });

    test("after revert, entity disappears from changes", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const feats = await Feats.createMany(db, [{ name: "Dodge", description: "Dodge attacks", rulesetId: parent.id }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Revert Fork", private: false },
      );

      // COW the feat
      await cowEntity(db, "feats", feats[0].id, fork.id);

      let changes = await RulesetsMethods.getChanges(forkSession, fork.id);
      expect(changes.length).toBe(1);

      // Revert via restoreEntity
      await RulesetsMethods.revertOverride(forkSession, fork.id, "feats", feats[0].id);

      changes = await RulesetsMethods.getChanges(forkSession, fork.id);
      expect(changes.length).toBe(0);
    });

    test("revert is blocked when a character on the fork has picked the COW entity", async () => {
      // Reverting hard-deletes the COW row, which FK-CASCADEs character picks.
      // The inUse guard mirrors the entity-delete services so reverts can't
      // silently wipe character data.
      const { user, session: parentSession } = await createTestUser();
      const { user: forkUser, session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const aptitudes = await Aptitudes.createMany(db, [
        { name: "General", description: "General feats", rulesetId: parent.id },
      ]);
      const races = await Races.create(db, {
        name: "Test Race", description: "Test", rulesetId: parent.id, size: "Medium", baseSpeed: 30,
      });
      const feats = await Feats.createMany(db, [{
        name: "Picked Feat", description: "Pickable", rulesetId: parent.id,
      }]);
      const klasses = await Klasses.create(db, {
        name: `Class ${Math.random().toString(36).substr(2, 9)}`, description: "Test", rulesetId: parent.id, hd: 10,
      });
      const klassLevels = await KlassLevels.create(db, { klassId: klasses[0].id, level: 1 });
      void parentSession;

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Pick Fork", private: false },
      );

      // COW the feat in the fork (creates the override + snapshot)
      const cowResult = await cowEntity(db, "feats", feats[0].id, fork.id);

      // Character on the fork picks the COW'd feat
      const characters = await Characters.create(db, {
        name: "Fork Character", userId: forkUser.id, rulesetId: fork.id, raceId: races[0].id,
        xp: 0, alignment: "Neutral Good", age: 25, gender: "Male", height: "180", weight: "75",
      });
      const characterLevels = await db.insert(levelsInCharacter).values({
        characterId: characters[0].id, klassLevelId: klassLevels[0].id, hp: 10,
      }).returning();
      await db.insert(levelFeatsInCharacter).values({
        characterLevelId: characterLevels[0].id,
        featId: cowResult.id as string,
        aptitudeId: aptitudes[0].id,
      });

      // Reverting would hard-delete the COW and CASCADE-wipe the character's pick — must be blocked
      await expect(
        RulesetsMethods.revertOverride(forkSession, fork.id, "feats", feats[0].id),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("restoreEntity cascade", () => {
    test("reverting a modified feat cleans up orphaned customizations and join tables", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const aptitudes = await Aptitudes.createMany(db, [{ name: "General", description: "General feats", rulesetId: parent.id }]);
      const feats = await Feats.createMany(db, [{ name: "Power Attack", description: "Trade accuracy", rulesetId: parent.id }]);

      // Add customizations and join tables to parent feat
      await Modifiers.createMany(db, [{
        sourceType: "feats",
        sourceId: feats[0].id,
        target: "baseAttackBonus",
        value: "2",
        valueType: "number",
        operator: "add",
      }]);
      await Properties.createMany(db, [{
        entityId: feats[0].id,
        entityType: "feats",
        type: "prerequisite",
        value: "Strength 13+",
      }]);
      await Requirements.createMany(db, [{
        entityId: feats[0].id,
        entityType: "feats",
        level: "character",
        target: "ability.strength",
        value: "13",
        valueType: "number",
        operator: "greater_than_or_equal",
      }]);
      await FeatsAptitudes.createMany(db, [{ featId: feats[0].id, aptitudeId: aptitudes[0].id }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Cascade Fork", private: false },
      );

      // COW the feat (creates a copy with customizations + join tables)
      const cowResult = await cowEntity(db, "feats", feats[0].id, fork.id);
      const cowFeatId = cowResult.id as string;

      // Verify COW copy has customizations
      const cowModifiers = await Modifiers.findManyBySource(db, { sourceIds: [cowFeatId], sourceType: "feats" });
      expect(cowModifiers.length).toBe(1);
      const cowProperties = await Properties.findManyByEntity(db, { entityIds: [cowFeatId], entityType: "feats" });
      expect(cowProperties.length).toBe(1);
      const cowRequirements = await Requirements.findManyByEntity(db, { entityIds: [cowFeatId], entityType: "feats" });
      expect(cowRequirements.length).toBe(1);
      const cowFeatsAptitudes = await db.select().from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.featId, cowFeatId));
      expect(cowFeatsAptitudes.length).toBe(1);

      // Revert the modified feat
      await RulesetsMethods.revertOverride(forkSession, fork.id, "feats", feats[0].id);

      // Verify all orphaned data is cleaned up
      const afterModifiers = await Modifiers.findManyBySource(db, { sourceIds: [cowFeatId], sourceType: "feats" });
      expect(afterModifiers.length).toBe(0);
      const afterProperties = await Properties.findManyByEntity(db, { entityIds: [cowFeatId], entityType: "feats" });
      expect(afterProperties.length).toBe(0);
      const afterRequirements = await Requirements.findManyByEntity(db, { entityIds: [cowFeatId], entityType: "feats" });
      expect(afterRequirements.length).toBe(0);
      const afterFeatsAptitudes = await db.select().from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.featId, cowFeatId));
      expect(afterFeatsAptitudes.length).toBe(0);

      // Verify parent customizations are untouched
      const parentModifiers = await Modifiers.findManyBySource(db, { sourceIds: [feats[0].id], sourceType: "feats" });
      expect(parentModifiers.length).toBe(1);
    });

    test("reverting a modified klass cleans up orphaned levels, level join tables, klass_skills", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const ability = await createTestAbility(parent.id, "Strength");
      const saves = await Saves.create(db, { name: "Fortitude", description: "Fort save", abilityId: ability.id, rulesetId: parent.id });
      const skills = await Skills.createMany(db, [{ name: "Climb", description: "Climb", rulesetId: parent.id, primaryAbilityId: ability.id }]);
      const aptitudes = await Aptitudes.createMany(db, [{ name: "Fighter Bonus Feat", description: "Fighter feats", rulesetId: parent.id }]);
      const feats = await Feats.createMany(db, [{ name: "Toughness", description: "HP", rulesetId: parent.id }]);
      const klasses = await Klasses.createMany(db, [{ name: "Fighter", description: "Warrior", rulesetId: parent.id, hd: 10 }]);

      // Add level with associations
      const levels = await KlassLevels.createMany(db, [{
        klassId: klasses[0].id,
        level: 1,
      }]);
      await KlassLevelSaves.createMany(db, [{ klassLevelId: levels[0].id, saveId: saves[0].id, base: 2 }]);
      await KlassLevelFeats.createMany(db, [{ klassLevelId: levels[0].id, featId: feats[0].id, aptitudeId: aptitudes[0].id }]);
      await KlassSkills.createMany(db, [{ klassId: klasses[0].id, skillId: skills[0].id }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Klass Cascade Fork", private: false },
      );

      // COW the klass
      const cowResult = await cowEntity(db, "klasses", klasses[0].id, fork.id);
      const cowKlassId = cowResult.id as string;

      // Verify COW copy has levels and associations
      const cowLevels = await KlassLevels.findManyByKlass(db, { klassId: cowKlassId });
      expect(cowLevels.length).toBe(1);

      const cowKlassSkills = await db.select().from(klassSkillsInRules)
        .where(eq(klassSkillsInRules.klassId, cowKlassId));
      expect(cowKlassSkills.length).toBe(1);

      // Revert the modified klass
      await RulesetsMethods.revertOverride(forkSession, fork.id, "klasses", klasses[0].id);

      // Verify all orphaned data is cleaned up
      const afterLevels = await KlassLevels.findManyByKlass(db, { klassId: cowKlassId });
      expect(afterLevels.length).toBe(0);
      const afterKlassSkills = await db.select().from(klassSkillsInRules)
        .where(eq(klassSkillsInRules.klassId, cowKlassId));
      expect(afterKlassSkills.length).toBe(0);
    });

    test("reverting a COW'd template item repoints copies to the original template", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const templates = await Items.createMany(db, [{
        name: "Longsword",
        description: "A versatile weapon",
        rulesetId: parent.id,
        isTemplate: true,
      }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Template Revert Fork", private: false },
      );

      // COW the template item
      const cowResult = await cowEntity(db, "items", templates[0].id, fork.id);
      const cowTemplateId = cowResult.id as string;

      // Create copies referencing the COW'd template
      const copies = await Items.createMany(db, [
        { name: "Longsword +1", description: "Magic sword", rulesetId: fork.id, sourceItemId: cowTemplateId },
        { name: "Longsword +2", description: "Greater magic sword", rulesetId: fork.id, sourceItemId: cowTemplateId },
      ]);

      // Revert the template — should succeed and repoint copies to original
      await RulesetsMethods.revertOverride(forkSession, fork.id, "items", templates[0].id);

      // Verify copies now reference the original (inherited) template
      for (const copy of copies) {
        const updated = await Items.findOne(db, { id: copy.id });
        expect(updated!.sourceItemId).toBe(templates[0].id);
      }

      // Verify the original template is visible again through inheritance
      const forkItems = await Items.findAll((pagination) =>
        Items.findManyByRulesetId(db, { rulesetId: fork.id, ancestorRulesetIds: fork.ancestorRulesetIds }, pagination),
      );
      expect(forkItems.some((i) => i.name === "Longsword" && i.isTemplate)).toBe(true);
    });

    test("reverting a deleted entity still works correctly", async () => {
      const { user } = await createTestUser();
      const { session: forkSession } = await createTestUser();

      const parent = await createTestRuleset(user.id, { status: "Published" });
      const feats = await Feats.createMany(db, [{ name: "Cleave", description: "Hit adjacent", rulesetId: parent.id }]);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession, parent.id, { name: "Delete Revert Fork", private: false },
      );

      // Delete the inherited feat (COWs + archives + cascades cleanup)
      await FeatsMethods.deleteRulesetFeat(forkSession, fork.id, feats[0].id);

      // Verify snapshot exists
      const snapBefore = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapBefore.length).toBe(1);

      // Revert (should not error — no double-cascade)
      await RulesetsMethods.revertOverride(forkSession, fork.id, "feats", feats[0].id);

      // Verify snapshot is removed
      const snapAfter = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapAfter.length).toBe(0);

      // Verify the inherited feat is visible again
      const inheritedFeats = await Feats.findAll((pagination) =>
        Feats.findManyByRulesetId(db, { rulesetId: fork.id, ancestorRulesetIds: fork.ancestorRulesetIds }, pagination),
      );
      expect(inheritedFeats.some((f) => f.name === "Cleave")).toBe(true);
    });
  });

  describe("extension siblingMap", () => {
    // Helper: creates a base, two extensions that COW the same base feat, and a child subscribed to both
    async function setupExtensionSiblings() {
      await createTestUser();
      const { user: childOwner, session: childSession } = await createTestUser();

      const base = await createBaseRuleset();

      // Create base entities
      await createTestAbility(base.id, "Strength");
      const aptitudes = await Aptitudes.createMany(db, [
        { name: "General", description: "General feats", rulesetId: base.id },
        { name: "Class Feature A", description: "Class A feature", rulesetId: base.id },
      ]);
      const feats = await Feats.createMany(db, [
        { name: "Shared Feat", description: "A feat both extensions modify", rulesetId: base.id },
        { name: "Only Feat", description: "An unmodified feat", rulesetId: base.id },
      ]);
      await FeatsAptitudes.createMany(db, [
        { featId: feats[0].id, aptitudeId: aptitudes[0].id },
        { featId: feats[1].id, aptitudeId: aptitudes[0].id },
      ]);

      // Add a standalone requirement on the shared feat (barbarian >= 7)
      await Requirements.createMany(db, [{
        entityId: feats[0].id,
        entityType: "feats",
        level: "1",
        target: "classes.barbarian.level",
        operator: "greater_than_or_equal",
        value: "7",
        valueType: "number",
      }]);

      // Create extension A (system fork of base)
      const extA = await Rulesets.create(db, {
        name: `Extension A ${Math.random().toString(36).substr(2, 5)}`,
        description: "Extension A",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });

      // Create extension B (system fork of base)
      const extB = await Rulesets.create(db, {
        name: `Extension B ${Math.random().toString(36).substr(2, 5)}`,
        description: "Extension B",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });

      // Extension A aptitude
      const extAApts = await Aptitudes.createMany(db, [
        { name: "Ext A Feature", description: "From extension A", rulesetId: extA[0].id },
      ]);

      // Extension B aptitude
      const extBApts = await Aptitudes.createMany(db, [
        { name: "Ext B Feature", description: "From extension B", rulesetId: extB[0].id },
      ]);

      // COW the shared feat into extension A
      const cowA = await cowEntity(db, "feats", feats[0].id, extA[0].id, [base.id]);
      // Convert standalone to OR chain and add ext A's class requirement
      const cowAReqs = await Requirements.findManyByEntity(db, { entityIds: [cowA.id], entityType: "feats" });
      const standaloneA = cowAReqs.find((r) => /^\d+$/.test(r.level) && r.target && !r.chainingOperator);
      if (standaloneA) {
        await Requirements.update(db, { target: null, operator: null, value: null, valueType: null, chainingOperator: "or" }, { id: standaloneA.id });
        await Requirements.createMany(db, [
          { entityId: cowA.id, entityType: "feats", level: `${standaloneA.level}.1`, target: standaloneA.target!, operator: standaloneA.operator!, value: standaloneA.value!, valueType: standaloneA.valueType! },
          { entityId: cowA.id, entityType: "feats", level: `${standaloneA.level}.2`, target: "classes.shadowdancer.level", operator: "greater_than_or_equal", value: "5", valueType: "number" },
        ]);
      }
      // Link ext A aptitude
      await FeatsAptitudes.createMany(db, [{ featId: cowA.id, aptitudeId: extAApts[0].id }]);
      // Add ext A modifier
      await Modifiers.createMany(db, [{
        sourceType: "feats",
        sourceId: cowA.id,
        target: "damageReduction.coldIron",
        value: "5",
        valueType: "number",
        operator: "add",
      }]);

      // COW the shared feat into extension B
      const cowB = await cowEntity(db, "feats", feats[0].id, extB[0].id, [base.id]);
      // Convert standalone to OR chain and add ext B's class requirement
      const cowBReqs = await Requirements.findManyByEntity(db, { entityIds: [cowB.id], entityType: "feats" });
      const standaloneB = cowBReqs.find((r) => /^\d+$/.test(r.level) && r.target && !r.chainingOperator);
      if (standaloneB) {
        await Requirements.update(db, { target: null, operator: null, value: null, valueType: null, chainingOperator: "or" }, { id: standaloneB.id });
        await Requirements.createMany(db, [
          { entityId: cowB.id, entityType: "feats", level: `${standaloneB.level}.1`, target: standaloneB.target!, operator: standaloneB.operator!, value: standaloneB.value!, valueType: standaloneB.valueType! },
          { entityId: cowB.id, entityType: "feats", level: `${standaloneB.level}.2`, target: "classes.favoredsoul.level", operator: "greater_than_or_equal", value: "17", valueType: "number" },
        ]);
      }
      // Link ext B aptitude
      await FeatsAptitudes.createMany(db, [{ featId: cowB.id, aptitudeId: extBApts[0].id }]);
      // Add ext B modifier (different from ext A)
      await Modifiers.createMany(db, [{
        sourceType: "feats",
        sourceId: cowB.id,
        target: "damageReduction.silver",
        value: "10",
        valueType: "number",
        operator: "add",
      }]);

      // Create a child ruleset subscribed to both extensions
      const child = await Rulesets.create(db, {
        name: `Child ${Math.random().toString(36).substr(2, 5)}`,
        description: "Child subscribed to both",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childOwner.id,
        status: "Draft",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
        extensionRulesetIds: [extA[0].id, extB[0].id],
      });

      invalidateAllCowData();

      return {
        base,
        extA: extA[0],
        extB: extB[0],
        child: child[0],
        childSession,
        baseFeat: feats[0],
        onlyFeat: feats[1],
        cowA: cowA as EntityWithId,
        cowB: cowB as EntityWithId,
        extAApts,
        extBApts,
        aptitudes,
      };
    }

    test("buildOverrideMap siblingMap maps winner to sibling when two extensions COW the same base feat", async () => {
      const { child, baseFeat, cowA, cowB } = await setupExtensionSiblings();

      const sourceChain = [...child.extensionRulesetIds, ...child.ancestorRulesetIds];
      const { map, siblingMap } = await buildOverrideMap(db, child.id, sourceChain, child.extensionRulesetIds);

      // Base feat should be overridden by one of the COWs (the winner)
      const winnerId = map.get(baseFeat.id)!;
      expect(winnerId).toBeDefined();
      expect([cowA.id, cowB.id]).toContain(winnerId);

      // The winner should map to the sibling in siblingMap
      const siblingIds = siblingMap.get(winnerId!);
      expect(siblingIds).toBeDefined();
      expect(siblingIds).toHaveLength(1);

      const loserId = winnerId === cowA.id ? cowB.id : cowA.id;
      expect(siblingIds![0]).toBe(loserId);
    });

    test("siblingMap is empty when only one extension COWs a base feat", async () => {
      const { user: owner } = await createTestUser();

      const base = await createBaseRuleset();
      const feats = await Feats.createMany(db, [{ name: "Solo Feat", description: "Only one ext", rulesetId: base.id }]);

      const ext = await Rulesets.create(db, {
        name: `Single Ext ${Math.random().toString(36).substr(2, 5)}`,
        description: "Single extension",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });

      await cowEntity(db, "feats", feats[0].id, ext[0].id, [base.id]);

      const child = await Rulesets.create(db, {
        name: `Child ${Math.random().toString(36).substr(2, 5)}`,
        description: "Child with one ext",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: owner.id,
        status: "Draft",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
        extensionRulesetIds: [ext[0].id],
      });

      invalidateAllCowData();

      const sourceChain = [...child[0].extensionRulesetIds, ...child[0].ancestorRulesetIds];
      const { siblingMap } = await buildOverrideMap(db, child[0].id, sourceChain, child[0].extensionRulesetIds);

      expect(siblingMap.size).toBe(0);
    });

    test("sibling entities are filtered from feat list results", async () => {
      const { child, onlyFeat } = await setupExtensionSiblings();

      invalidateAllCowData();

      const cowData = await getOrBuildCowData(child);

      // Sibling should be filtered out
      const allSiblingIds = new Set(Array.from(cowData.siblingMap.values()).flat());
      expect(allSiblingIds.size).toBe(1);

      const allFeats = await Feats.findAll((pagination) =>
        Feats.findManyByRulesetId(db, {
          rulesetId: child.id,
          ancestorRulesetIds: [...child.extensionRulesetIds, ...child.ancestorRulesetIds],
        }, pagination),
      );

      // Remove siblings like the cache/service layer does
      const filteredFeats = allFeats.filter((f) => !allSiblingIds.has(f.id));

      // Should have exactly 2 feats: the winner COW of "Shared Feat" and the unmodified "Only Feat"
      const sharedFeatResults = filteredFeats.filter((f) => f.name === "Shared Feat");
      expect(sharedFeatResults).toHaveLength(1);

      const onlyFeatResults = filteredFeats.filter((f) => f.name === "Only Feat");
      expect(onlyFeatResults).toHaveLength(1);
      expect(onlyFeatResults[0].id).toBe(onlyFeat.id);
    });

    test("cowEntity merges sibling requirements when child COWs the winner", async () => {
      const { child, cowA } = await setupExtensionSiblings();

      invalidateAllCowData();

      const cowData = await getOrBuildCowData(child);
      const winnerId = cowData.overrideMap.get(cowA.id) ?? cowA.id;
      const sourceChain = [...child.extensionRulesetIds, ...child.ancestorRulesetIds];

      // COW the winner into the child — should merge sibling requirements
      const childCow = await cowEntity(db, "feats", winnerId, child.id, sourceChain, child.extensionRulesetIds);

      const childReqs = await Requirements.findManyByEntity(db, { entityIds: [childCow.id], entityType: "feats" });

      // Each extension contributed its own OR chain. The merge preserves them
      // as TWO separate OR groups (winner's + loser's), AND'd together at top
      // level — `(barbarian OR shadowdancer) AND (barbarian OR favoredsoul)`.
      // Conflating them into one (barbarian OR shadowdancer OR favoredsoul)
      // would loosen the requirement (any single class would pass instead of
      // requiring at least one from each group).
      const orChains = childReqs.filter((r) => r.chainingOperator === "or" && /^\d+$/.test(r.level));
      expect(orChains).toHaveLength(2);

      const chainTargets = orChains.map((root) => {
        const prefix = `${root.level}.`;
        return childReqs
          .filter((r) => r.level.startsWith(prefix) && r.target)
          .map((r) => r.target)
          .sort();
      });

      // Each chain has exactly two leaves; barbarian appears in BOTH chains
      // (the schema's old uniqueness on (target, operator, value) used to
      // forbid this and forced one barbarian leaf to be dropped). Now both
      // are preserved, so the full semantic
      //   `(barbarian OR shadowdancer) AND (barbarian OR favoredsoul)`
      // is round-tripped correctly.
      expect(chainTargets.every((leaves) => leaves.length === 2)).toBe(true);
      const flat = chainTargets.flat().sort();
      expect(flat).toEqual([
        "classes.barbarian.level",
        "classes.barbarian.level",
        "classes.favoredsoul.level",
        "classes.shadowdancer.level",
      ]);
    });

    test("cowEntity merges sibling aptitude links when child COWs the winner", async () => {
      const { child, cowA, extAApts, extBApts } = await setupExtensionSiblings();

      invalidateAllCowData();

      const cowData = await getOrBuildCowData(child);
      const winnerId = cowData.overrideMap.get(cowA.id) ?? cowA.id;
      const sourceChain = [...child.extensionRulesetIds, ...child.ancestorRulesetIds];

      // COW the winner into the child — should merge sibling aptitude links
      const childCow = await cowEntity(db, "feats", winnerId, child.id, sourceChain, child.extensionRulesetIds);

      const childApts = await FeatsAptitudes.findMany(db, { featId: childCow.id });
      const aptIds = childApts.map((a) => a.aptitudeId);

      // Should have both extension aptitudes (plus the base General aptitude)
      expect(aptIds).toContain(extAApts[0].id);
      expect(aptIds).toContain(extBApts[0].id);
    });

    test("child COW of winner records extension shadows as siblings (so compose filters them)", async () => {
      const { child, baseFeat, cowA, cowB } = await setupExtensionSiblings();

      invalidateAllCowData();

      const sourceChain = [...child.extensionRulesetIds, ...child.ancestorRulesetIds];

      // COW the winner into the child
      const childCow = await cowEntity(db, "feats", cowA.id, child.id, sourceChain, child.extensionRulesetIds);

      // Now rebuild the override map — child's own COW should win
      invalidateAllCowData();
      const { map, siblingMap } = await buildOverrideMap(db, child.id, sourceChain, child.extensionRulesetIds);

      // The child's own copy should be the winner
      const winnerId = map.get(baseFeat.id);
      expect(winnerId).toBe(childCow.id);

      // Extension shadows are recorded as siblings of the child's COW so the
      // compose step hides them and dedup-merges any straggler customizations.
      // The child's COW data is still authoritative — mergeSiblingData baked
      // sibling contributions in at COW time.
      const siblings = siblingMap.get(childCow.id) ?? [];
      expect(siblings.sort()).toEqual([cowA.id, cowB.id].sort());
    });

    test("cowEntity merges sibling modifiers when child COWs the winner", async () => {
      const { child, cowA } = await setupExtensionSiblings();

      invalidateAllCowData();

      const cowData = await getOrBuildCowData(child);
      const winnerId = cowData.overrideMap.get(cowA.id) ?? cowA.id;
      const sourceChain = [...child.extensionRulesetIds, ...child.ancestorRulesetIds];

      // COW the winner into the child — should merge sibling modifiers
      const childCow = await cowEntity(db, "feats", winnerId, child.id, sourceChain, child.extensionRulesetIds);

      // Fetch modifiers on the child's copy
      const childMods = await Modifiers.findManyBySource(db, { sourceIds: [childCow.id], sourceType: "feats" });

      // Should have both extension modifiers
      const targets = childMods.map((m) => m.target).sort();
      expect(targets).toContain("damageReduction.coldIron");
      expect(targets).toContain("damageReduction.silver");
    });

    test("FeatsMethods.getRulesetFeats filters out sibling entities via service layer", async () => {
      const { child } = await setupExtensionSiblings();
      invalidateAllCowData();

      const result = await FeatsMethods.getRulesetFeats(child.id, { search: "Shared Feat" }, { limit: 10, page: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Shared Feat");
    });

    test("unsubscribing one extension makes siblingMap empty", async () => {
      const { child, childSession, extB } = await setupExtensionSiblings();
      invalidateAllCowData();

      // Verify siblingMap is non-empty before unsubscribe
      const beforeChain = [...child.extensionRulesetIds, ...child.ancestorRulesetIds];
      const before = await buildOverrideMap(db, child.id, beforeChain, child.extensionRulesetIds);
      expect(before.siblingMap.size).toBe(1);

      // Unsubscribe ext B
      await RulesetsMethods.unsubscribeExtension(childSession, child.id, extB.id);
      invalidateAllCowData();

      // Refetch child to get updated extensionRulesetIds
      const updated = await Rulesets.findOne(db, { id: child.id });
      expect(updated!.extensionRulesetIds).not.toContain(extB.id);

      const afterChain = [...updated!.extensionRulesetIds, ...updated!.ancestorRulesetIds];
      const after = await buildOverrideMap(db, updated!.id, afterChain, updated!.extensionRulesetIds);
      expect(after.siblingMap.size).toBe(0);
    });

    // ── Runtime sibling merge in DetailedCharacter ──
    // Uses the real seeded DMG + Complete Divine extensions.
    // Both COW "Damage Reduction" from the base — DMG adds Dwarven Defender,
    // CD adds Favored Soul. A character with Barbarian >= 7 satisfies the
    // base requirement in the merged OR chain.

    async function setupSiblingCharacter() {
      const { user: owner, session } = await createTestUser();

      const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
      if (!base) throw new Error("Base D&D 3.5 not found — run test:db:reset");
      const dmg = await Rulesets.findOne(db, { name: DND35_DMG_NAME });
      if (!dmg) throw new Error("DMG not found — run test:db:reset");
      const cd = await Rulesets.findOne(db, { name: DND35_COMPLETE_DIVINE_NAME });
      if (!cd) throw new Error("Complete Divine not found — run test:db:reset");

      // Query base entities
      const baseAbilities = await db
        .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
        .from(abilitiesInRules)
        .where(and(eq(abilitiesInRules.rulesetId, base.id), isNull(abilitiesInRules.deletedAt)));
      const baseRaces = await db
        .select({ id: racesInRules.id, name: racesInRules.name })
        .from(racesInRules)
        .where(eq(racesInRules.rulesetId, base.id));
      const baseKlasses = await db
        .select({ id: klassesInRules.id, name: klassesInRules.name })
        .from(klassesInRules)
        .where(eq(klassesInRules.rulesetId, base.id));
      const baseAptitudes = await db
        .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
        .from(aptitudesInRules)
        .where(eq(aptitudesInRules.rulesetId, base.id));
      const baseFeats = await db
        .select({ id: featsInRules.id, name: featsInRules.name })
        .from(featsInRules)
        .where(eq(featsInRules.rulesetId, base.id));

      const human = baseRaces.find((r) => r.name === "Human")!;
      const barbarian = baseKlasses.find((k) => k.name === "Barbarian")!;
      const damageReduction = baseFeats.find((f) => f.name === "Damage Reduction (Barbarian)")!;
      const barbarianFeatureApt = baseAptitudes.find((a) => a.name === "Barbarian Class Feature")!;

      // Get Barbarian class levels (need 7 for Damage Reduction)
      const barbarianLevels = await KlassLevels.findManyByKlass(db, { klassId: barbarian.id });

      // Fork the base and subscribe to both DMG + CD
      const rand = () => Math.random().toString(36).substr(2, 5);
      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `SibCharFork ${rand()}`,
        private: false,
      });
      await RulesetsMethods.subscribeExtension(session, fork.id, [dmg.id]);
      await RulesetsMethods.subscribeExtension(session, fork.id, [cd.id]);

      // Create character on fork
      const [character] = await db
        .insert(charactersInCharacter)
        .values({
          userId: owner.id,
          rulesetId: fork.id,
          raceId: human.id,
          name: `SibTestChar ${rand()}`,
          xp: 21000,
          alignment: "True Neutral",
          age: 25,
          gender: "Male",
          height: "180",
          weight: "85",
        })
        .returning();

      // Add ability scores
      await db.insert(characterAbilitiesInCharacter).values(
        baseAbilities.map((a) => ({ characterId: character.id, abilityId: a.id, score: 10 })),
      );

      // Add 7 Barbarian levels
      const charLevelIds: string[] = [];
      for (let i = 1; i <= 7; i++) {
        const klassLevel = barbarianLevels.find((l) => l.level === i)!;
        const [cl] = await db
          .insert(levelsInCharacter)
          .values({ characterId: character.id, klassLevelId: klassLevel.id, hp: 8 })
          .returning();
        charLevelIds.push(cl.id);
      }

      // Equip Damage Reduction at level 7 via Barbarian Class Feature
      await db.insert(levelFeatsInCharacter).values({
        characterLevelId: charLevelIds[6],
        featId: damageReduction.id,
        aptitudeId: barbarianFeatureApt.id,
      });

      invalidateAllCowData();

      return { fork, character, damageReduction, dmg, cd, session, owner };
    }

    test("DetailedCharacter.build() processes class-specific feat without errors", async () => {
      const { character } = await setupSiblingCharacter();

      const dc = new DetailedCharacter(character as never);
      await dc.build();

      // Damage Reduction (Barbarian) is a class feature feat with no requirements
      // It should build and validate without issues
      const validation = dc.validate();
      const drModIssues = validation.issues.filter(
        (i) => i.category === "modifiers" && i.entityName === "Damage Reduction (Barbarian)",
      );
      expect(drModIssues).toHaveLength(0);
    });

    test("DetailedCharacter.build() handles multiple extensions with class-specific feats", async () => {
      const { character } = await setupSiblingCharacter();

      const dc = new DetailedCharacter(character as never);
      await dc.build();

      // Verify no modifier-related validation issues for Damage Reduction (Barbarian)
      const validation = dc.validate();
      const drIssues = validation.issues.filter(
        (i) => i.entityName === "Damage Reduction (Barbarian)",
      );
      expect(drIssues).toHaveLength(0);
    });

    test("DetailedCharacter.validate() has no Damage Reduction requirement issues", async () => {
      const { character } = await setupSiblingCharacter();

      const dc = new DetailedCharacter(character as never);
      await dc.build();
      const validation = dc.validate();

      // Class feature feats have no requirements — gated by class level grants
      const drIssues = validation.issues.filter(
        (i) => i.category === "requirements" && i.entityName === "Damage Reduction (Barbarian)",
      );
      expect(drIssues).toHaveLength(0);
    });

    // ── Name-based fallback for same-name reprints ──
    // Real-world case: a spell appears natively in two D&D sourcebooks
    // (e.g. Forestfold in Complete Adventurer + Complete Divine) without
    // a shared base entity. The runtime pairs them as siblings so compose
    // produces one merged entity. Pairing is not gated on the `system`
    // flag — the same mechanism works for user-authored extensions that
    // intentionally reuse a name from another extension. Last resort: rows
    // already paired via entitySnapshotsInRules are excluded so the
    // snapshot-based pass always wins.
    async function setupNameReprints() {
      const { session: childSession } = await createTestUser();
      const base = await createBaseRuleset();
      await Aptitudes.createMany(db, [
        { name: "General", description: "General feats", rulesetId: base.id },
      ]);

      const extA = await Rulesets.create(db, {
        name: `Reprint Ext A ${Math.random().toString(36).substr(2, 5)}`,
        description: "Reprint Extension A",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });

      const extB = await Rulesets.create(db, {
        name: `Reprint Ext B ${Math.random().toString(36).substr(2, 5)}`,
        description: "Reprint Extension B",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });

      const powersA = await Powers.createMany(db, [
        { name: "Forestfold", description: "From A — canonical", rulesetId: extA[0].id },
      ]);
      const powersB = await Powers.createMany(db, [
        { name: "Forestfold", description: "From B — abridged", rulesetId: extB[0].id },
      ]);

      return {
        base,
        extA: extA[0],
        extB: extB[0],
        powersA: powersA[0],
        powersB: powersB[0],
        childSession,
      };
    }

    test("subscribeExtension pairs same-name native rows across two extensions", async () => {
      const { base, extA, extB, powersA, powersB, childSession } = await setupNameReprints();
      const fork = await RulesetsMethods.forkRuleset(childSession, base.id, {
        name: `Reprint Fork ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });

      // Subscribe both — must not throw, then verify the runtime pairs them.
      await RulesetsMethods.subscribeExtension(childSession, fork.id, [extA.id, extB.id]);
      invalidateAllCowData();

      const updated = (await Rulesets.findOne(db, { id: fork.id }))!;
      const cowData = await getOrBuildCowData(updated);

      const winner = cowData.siblingMap.has(powersA.id) ? powersA : powersB;
      const loser = winner.id === powersA.id ? powersB : powersA;
      expect(cowData.siblingMap.get(winner.id)).toContain(loser.id);
      expect(cowData.idResolveMap.get(loser.id)).toBe(winner.id);
      expect(cowData.siblingIds.has(loser.id)).toBe(true);
    });

    test("subscribeExtension blocks extension+extension collisions on non-pairable types (races)", async () => {
      // Only feats and powers participate in name-fallback pairing. Other
      // entity types (races, classes, abilities, …) have no runtime merge,
      // so a same-name collision across extensions would surface as visible
      // duplicates. The assertion must still block those.
      const { session } = await createTestUser();
      const base = await createBaseRuleset();
      const extA = await Rulesets.create(db, {
        name: `RaceExtA ${Math.random().toString(36).substr(2, 5)}`,
        description: "Race ext A",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });
      const extB = await Rulesets.create(db, {
        name: `RaceExtB ${Math.random().toString(36).substr(2, 5)}`,
        description: "Race ext B",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });
      await Races.createMany(db, [
        { name: "Tiefling", description: "From A", rulesetId: extA[0].id, size: "Medium", baseSpeed: 30 },
      ]);
      await Races.createMany(db, [
        { name: "Tiefling", description: "From B", rulesetId: extB[0].id, size: "Medium", baseSpeed: 30 },
      ]);

      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `RaceCollision Fork ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });

      await expect(
        RulesetsMethods.subscribeExtension(session, fork.id, [extA[0].id, extB[0].id]),
      ).rejects.toThrow(ConflictError);
    });

    test("subscribeExtension blocks when the host has a native row colliding with an extension", async () => {
      // Host's native rows can't be sibling-paired (host isn't part of its own
      // source chain), so allowing the subscribe would produce visible
      // duplicates. The assertion must still catch this.
      const { session } = await createTestUser();
      const base = await createBaseRuleset();
      await Aptitudes.createMany(db, [
        { name: "General", description: "General feats", rulesetId: base.id },
      ]);
      const ext = await Rulesets.create(db, {
        name: `Ext ${Math.random().toString(36).substr(2, 5)}`,
        description: "Some extension",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });
      await Powers.createMany(db, [
        { name: "Conflict", description: "Extension's row", rulesetId: ext[0].id },
      ]);

      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `HostCollision Fork ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });
      // Author a host-native row with the same name, before subscribing.
      await Powers.createMany(db, [
        { name: "Conflict", description: "Host's homebrew", rulesetId: fork.id },
      ]);

      await expect(
        RulesetsMethods.subscribeExtension(session, fork.id, [ext[0].id]),
      ).rejects.toThrow(ConflictError);
    });

    test("snapshot-paired siblings are not double-paired by the name-fallback pass", async () => {
      // Both extensions COW the same base feat (snapshot path). The name
      // pass excludes snapshotted rows, so siblingMap should contain exactly
      // one pair (from the snapshot pass), not two.
      const { child, baseFeat, cowA, cowB } = await setupExtensionSiblings();
      invalidateAllCowData();

      const cowData = await getOrBuildCowData(child);

      // The snapshot pass picks one COW as winner; the other is the sibling.
      const winnerId = cowData.overrideMap.get(baseFeat.id)!;
      expect([cowA.id, cowB.id]).toContain(winnerId);
      const loserId = winnerId === cowA.id ? cowB.id : cowA.id;
      const siblings = cowData.siblingMap.get(winnerId) ?? [];
      // Exactly one sibling — the name-fallback didn't add a duplicate entry.
      expect(siblings.filter((s) => s === loserId)).toHaveLength(1);
    });

    test("extension wins over base when both natively define the same name", async () => {
      // A system extension that reprints a base entity natively (no snapshot)
      // overrides base, mirroring the snapshot pass's
      // `idResolveMap[base-id] = ext-id` direction. Base aliases to extension;
      // compose merges base's contributions into extension's display.
      const { session: childSession } = await createTestUser();
      const base = await createBaseRuleset();
      await Aptitudes.createMany(db, [
        { name: "General", description: "General feats", rulesetId: base.id },
      ]);
      const basePower = await Powers.createMany(db, [
        { name: "Reprint", description: "Base canonical", rulesetId: base.id },
      ]);
      const ext = await Rulesets.create(db, {
        name: `Reprint Ext ${Math.random().toString(36).substr(2, 5)}`,
        description: "Extension that reprints a base spell",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: null,
        status: "Published",
        kind: "extension",
        rulesetId: base.id,
        ancestorRulesetIds: [base.id],
      });
      const extPower = await Powers.createMany(db, [
        { name: "Reprint", description: "Extension reprint", rulesetId: ext[0].id },
      ]);

      const fork = await RulesetsMethods.forkRuleset(childSession, base.id, {
        name: `ExtWins Fork ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });
      await RulesetsMethods.subscribeExtension(childSession, fork.id, [ext[0].id]);
      invalidateAllCowData();

      const updated = (await Rulesets.findOne(db, { id: fork.id }))!;
      const cowData = await getOrBuildCowData(updated);

      // Extension wins; base's row is the sibling-loser aliased to extension.
      expect(cowData.siblingMap.get(extPower[0].id)).toContain(basePower[0].id);
      expect(cowData.idResolveMap.get(basePower[0].id)).toBe(extPower[0].id);
      // Inverse must NOT hold — extension's id is canonical, doesn't alias.
      expect(cowData.siblingMap.has(basePower[0].id)).toBe(false);
      expect(cowData.idResolveMap.has(extPower[0].id)).toBe(false);
    });
  });

  describe("subscribeExtension kind gating", () => {
    test("rejects subscribing to a fork published as a ruleset (not an extension)", async () => {
      const { session: ownerSession } = await createTestUser();
      const { session: subscriberSession } = await createTestUser();
      const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
      if (!base) throw new Error("Base D&D 3.5 ruleset not found — run reset-db");

      const playableFork = await RulesetsMethods.forkRuleset(ownerSession, base.id, {
        name: `Playable ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });
      await RulesetsMethods.publishRuleset(ownerSession, playableFork.id);

      const subscriberFork = await RulesetsMethods.forkRuleset(subscriberSession, base.id, {
        name: `Subscriber ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });

      await expect(
        RulesetsMethods.subscribeExtension(subscriberSession, subscriberFork.id, [playableFork.id]),
      ).rejects.toThrow(UnprocessableEntityError);
    });
  });
});
