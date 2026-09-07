import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Characters, Modifiers, Properties, Races, Requirements, Rulesets, Users } from "@/server/repositories/index.ts";
import { languagesInCharacter } from "@/drizzle/schema.ts";
import { LanguagesMethods } from "@/server/services/rulesets/LanguagesService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("LanguagesService", () => {
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

  // Helper to create test user and ruleset
  async function createTestUserAndRuleset() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for languages testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createTestSession(user.id) };
  }

  describe("getRulesetLanguages", () => {
    test("should return languages for a valid ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await LanguagesMethods.getRulesetLanguages(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        LanguagesMethods.getRulesetLanguages(fakeRulesetId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    test("should return empty array for ruleset with no languages", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await LanguagesMethods.getRulesetLanguages(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(0);
    });

    test("should return all languages for a ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create multiple languages
      await LanguagesMethods.createRulesetLanguage(session, ruleset.id, {
        name: "Common",
        description: "The common tongue",
        type: "Standard",
      });

      await LanguagesMethods.createRulesetLanguage(session, ruleset.id, {
        name: "Elvish",
        description: "Language of elves",
        type: "Exotic",
      });

      const result = await LanguagesMethods.getRulesetLanguages(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBe(2);
      expect(result.items.some(l => l.name === "Common")).toBe(true);
      expect(result.items.some(l => l.name === "Elvish")).toBe(true);
    });
  });

  describe("createRulesetLanguage", () => {
    test("should create a language with all required fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const languageData = {
        name: "Common",
        description: "The common tongue spoken by most races",
        type: "Standard",
      };

      const language = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        languageData
      );

      expect(language).toBeDefined();
      expect(language.name).toBe(languageData.name);
      expect(language.description).toBe(languageData.description);
      expect(language.type).toBe(languageData.type);
      expect(language.rulesetId).toBe(ruleset.id);
    });

    test("should create a language with exotic type", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const languageData = {
        name: "Draconic",
        description: "Ancient language of dragons",
        type: "Exotic",
      };

      const language = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        languageData
      );

      expect(language).toBeDefined();
      expect(language.name).toBe(languageData.name);
      expect(language.type).toBe("Exotic");
    });

    test("should create a language with empty description", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const languageData = {
        name: "Unknown Language",
        description: "",
        type: "Standard",
      };

      const language = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        languageData
      );

      expect(language).toBeDefined();
      expect(language.name).toBe(languageData.name);
      expect(language.description).toBe("");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        LanguagesMethods.createRulesetLanguage(session, fakeRulesetId, {
          name: "Common",
          description: "Test",
          type: "Standard",
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      await expect(
        LanguagesMethods.createRulesetLanguage(otherSession, ruleset.id, {
          name: "Common",
          description: "Test",
          type: "Standard",
        })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create multiple languages in the same ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const language1 = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Common",
          description: "Common tongue",
          type: "Standard",
        }
      );

      const language2 = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Elvish",
          description: "Elven language",
          type: "Standard",
        }
      );

      expect(language1.id).not.toBe(language2.id);
      expect(language1.rulesetId).toBe(ruleset.id);
      expect(language2.rulesetId).toBe(ruleset.id);
    });
  });

  describe("updateRulesetLanguage", () => {
    test("should update all fields of a language", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create language first
      const created = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Original Name",
          description: "Original description",
          type: "Standard",
        }
      );

      // Update it
      const updateData = {
        name: "Updated Name",
        description: "Updated description",
        type: "Exotic",
      };

      const updated = await LanguagesMethods.updateRulesetLanguage(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.name).toBe(updateData.name);
      expect(updated.description).toBe(updateData.description);
      expect(updated.type).toBe(updateData.type);
      expect(updated.id).toBe(created.id);
    });

    test("should update only name", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Original",
          description: "Original description",
          type: "Standard",
        }
      );

      const updated = await LanguagesMethods.updateRulesetLanguage(
        session,
        ruleset.id,
        created.id,
        {
          name: "Updated",
          description: created.description ?? undefined,
          type: created.type,
        }
      );

      expect(updated.name).toBe("Updated");
      expect(updated.description).toBe(created.description);
      expect(updated.type).toBe(created.type);
    });

    test("should update only type", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Test Language",
          description: "Test description",
          type: "Standard",
        }
      );

      const updated = await LanguagesMethods.updateRulesetLanguage(
        session,
        ruleset.id,
        created.id,
        {
          name: created.name,
          description: created.description ?? undefined,
          type: "Exotic",
        }
      );

      expect(updated.name).toBe(created.name);
      expect(updated.type).toBe("Exotic");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        LanguagesMethods.updateRulesetLanguage(
          session,
          fakeRulesetId,
          "fake-language-id",
          {
            name: "Test",
            description: "Test",
            type: "Standard",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent language", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeLanguageId = "00000000-0000-0000-0000-000000000000";

      await expect(
        LanguagesMethods.updateRulesetLanguage(
          session,
          ruleset.id,
          fakeLanguageId,
          {
            name: "Test",
            description: "Test",
            type: "Standard",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when language exists but not in specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();

      // Create language in ruleset1
      const language = await LanguagesMethods.createRulesetLanguage(
        session1,
        ruleset1.id,
        {
          name: "Test Language",
          description: "Test",
          type: "Standard",
        }
      );

      // Try to update it as if it's in ruleset2 (policy check happens first)
      await expect(
        LanguagesMethods.updateRulesetLanguage(
          session1,
          ruleset2.id,
          language.id,
          {
            name: "Updated",
            description: "Updated",
            type: "Standard",
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create language as owner
      const language = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Test Language",
          description: "Test",
          type: "Standard",
        }
      );

      // Try to update as different user
      await expect(
        LanguagesMethods.updateRulesetLanguage(
          otherSession,
          ruleset.id,
          language.id,
          {
            name: "Updated",
            description: "Updated",
            type: "Standard",
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetLanguage", () => {
    test("should delete a language", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create language first
      const created = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "To Delete",
          description: "Will be deleted",
          type: "Standard",
        }
      );

      // Delete it
      const deleted = await LanguagesMethods.deleteRulesetLanguage(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's gone
      const result = await LanguagesMethods.getRulesetLanguages(ruleset.id, {}, { limit: 10, page: 1 });
      expect(result.items.find(l => l.id === deleted.id)).toBeUndefined();
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        LanguagesMethods.deleteRulesetLanguage(
          session,
          fakeRulesetId,
          "fake-language-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent language", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeLanguageId = "00000000-0000-0000-0000-000000000000";

      await expect(
        LanguagesMethods.deleteRulesetLanguage(
          session,
          ruleset.id,
          fakeLanguageId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when language exists but not in specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();

      // Create language in ruleset1
      const language = await LanguagesMethods.createRulesetLanguage(
        session1,
        ruleset1.id,
        {
          name: "Test Language",
          description: "Test",
          type: "Standard",
        }
      );

      // Try to delete it as if it's in ruleset2 (policy check happens first)
      await expect(
        LanguagesMethods.deleteRulesetLanguage(
          session1,
          ruleset2.id,
          language.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create language as owner
      const language = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Test Language",
          description: "Test",
          type: "Standard",
        }
      );

      // Try to delete as different user
      await expect(
        LanguagesMethods.deleteRulesetLanguage(
          otherSession,
          ruleset.id,
          language.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should block deletion when a host subscribed to this extension has a character speaking the language", async () => {
      const { user, ruleset: extension, session } = await createTestUserAndRuleset();
      const language = await LanguagesMethods.createRulesetLanguage(session, extension.id, {
        name: "Extension Tongue",
        description: "Test",
        type: "Standard",
      });

      const hostRows = await Rulesets.create(db, {
        name: `Host ${Math.random().toString(36).substr(2, 9)}`,
        description: "Subscribes to extension",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
        extensionRulesetIds: [extension.id],
      });
      const host = hostRows[0];
      const races = await Races.create(db, { name: `Race ${Math.random().toString(36).substr(2, 9)}`, description: "Test", rulesetId: host.id, size: "Medium", baseSpeed: 30 });
      const characters = await Characters.create(db, { name: "Subscriber", userId: user.id, rulesetId: host.id, raceId: races[0].id, xp: 0, alignment: "Neutral Good", age: 25, gender: "Male", height: "180", weight: "75" });
      await db.insert(languagesInCharacter).values({ characterId: characters[0].id, languageId: language.id });

      await expect(
        LanguagesMethods.deleteRulesetLanguage(session, extension.id, language.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should delete only the specified language", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create multiple languages
      const language1 = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Keep This",
          description: "Should remain",
          type: "Standard",
        }
      );

      const language2 = await LanguagesMethods.createRulesetLanguage(
        session,
        ruleset.id,
        {
          name: "Delete This",
          description: "Should be deleted",
          type: "Standard",
        }
      );

      // Delete one
      await LanguagesMethods.deleteRulesetLanguage(
        session,
        ruleset.id,
        language2.id
      );

      // Verify only one was deleted
      const result = await LanguagesMethods.getRulesetLanguages(ruleset.id, {}, { limit: 10, page: 1 });
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(language1.id);
      expect(result.items[0].name).toBe("Keep This");
    });
  });

  describe("COW fork", () => {
    test("should throw ConflictError when creating language with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      await LanguagesMethods.createRulesetLanguage(parentSession, parentRuleset.id, {
        name: "Elvish",
        description: "The language of elves",
        type: "Standard",
      });

      const { session: childSession } = await createTestUserAndRuleset();
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childSession.userId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      await expect(
        LanguagesMethods.createRulesetLanguage(childSession, childRuleset.id, {
          name: "Elvish",
          description: "Duplicate name",
          type: "Standard",
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("deleteRulesetLanguage - cascade", () => {
    test("should hard-delete customizations when deleting language", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const language = await LanguagesMethods.createRulesetLanguage(session, ruleset.id, {
        name: "Language With Customizations",
        description: "Test",
        type: "Standard",
      });

      // Add customizations
      await Modifiers.create(db, {
        sourceId: language.id,
        sourceType: "languages",
        target: "abilities.charisma",
        value: "1",
        valueType: "number",
        operator: "add",
      });
      await Properties.create(db, {
        entityId: language.id,
        entityType: "languages",
        type: "test",
        value: "test",
      });
      await Requirements.create(db, {
        entityId: language.id,
        entityType: "languages",
        level: "character",
        target: "abilities.intelligence",
        value: "10",
        valueType: "number",
        operator: "greater_than",
      });

      // Delete the language
      await LanguagesMethods.deleteRulesetLanguage(session, ruleset.id, language.id);

      // All customizations should be completely gone
      const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [language.id], sourceType: "languages" });
      const properties = await Properties.findManyByEntity(db, { entityIds: [language.id], entityType: "languages" });
      const requirements = await Requirements.findManyByEntity(db, { entityIds: [language.id], entityType: "languages" });
      expect(modifiers.length).toBe(0);
      expect(properties.length).toBe(0);
      expect(requirements.length).toBe(0);
    });
  });
});
