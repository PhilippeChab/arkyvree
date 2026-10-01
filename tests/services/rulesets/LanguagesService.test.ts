import { describe, expect, test } from "bun:test";

import { languagesInCharacter } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { LanguagesMethods } from "@/server/services/rulesets/LanguagesService.ts";
import { createTestCharacter, createTestRuleset, createTestUserAndRuleset } from "@/tests/helpers.ts";

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("LanguagesService", () => {
  test("stores a language's type and description", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const created = await LanguagesMethods.createRulesetLanguage(session, ruleset.id, {
      name: "Draconic",
      description: "Spoken by dragons",
      type: "Exotic",
    });
    expect(created).toMatchObject({ type: "Exotic", description: "Spoken by dragons" });

    const updated = await LanguagesMethods.updateRulesetLanguage(session, ruleset.id, created.id, {
      name: "Draconic",
      description: "Common among kobolds",
      type: "Standard",
    });
    expect(updated).toMatchObject({ type: "Standard", description: "Common among kobolds" });
  });

  test("refuses to delete a language that a character of a subscribing ruleset speaks", async () => {
    const { user, session, ruleset: extension } = await createTestUserAndRuleset();
    const language = await LanguagesMethods.createRulesetLanguage(session, extension.id, {
      name: "Extension Tongue",
      type: "Standard",
    });
    const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });
    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    await db.insert(languagesInCharacter).values({ characterId: character.id, languageId: language.id });

    await expect(LanguagesMethods.deleteRulesetLanguage(session, extension.id, language.id)).rejects.toThrow(
      ConflictError,
    );
  });
});
