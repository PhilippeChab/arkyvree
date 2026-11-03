import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { CharacterLinks } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { createTestRuleset, subscribeTestRuleset } from "@/tests/support/rulesets.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("EntitiesService: languages", () => {
  test("stores a language's type and description", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const created = await EntitiesService.createEntity(session, ruleset.id, "languages", {
      name: "Draconic",
      description: "Spoken by dragons",
      fields: { [LANGUAGE_TYPE]: "Exotic" },
    });
    expect(created).toMatchObject({ fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "Spoken by dragons" });

    const updated = await EntitiesService.updateEntity(session, ruleset.id, "languages", created.id, {
      name: "Draconic",
      description: "Common among kobolds",
      fields: { [LANGUAGE_TYPE]: "Standard" },
    });
    expect(updated).toMatchObject({ fields: { [LANGUAGE_TYPE]: "Standard" }, description: "Common among kobolds" });
  });

  test("refuses to delete a language that a character of a subscribing ruleset speaks", async () => {
    const { user, session, ruleset: extension } = await createTestUserAndRuleset();
    const language = await EntitiesService.createEntity(session, extension.id, "languages", {
      name: "Extension Tongue",
      fields: { [LANGUAGE_TYPE]: "Standard" },
    });
    const host = await createTestRuleset(user.id);
    await subscribeTestRuleset(host.id, [extension.id]);
    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    await CharacterLinks.createMany(db, character.id, "speaks", [{ entityId: language.id }]);

    expect(EntitiesService.deleteEntity(session, extension.id, "languages", language.id)).rejects.toThrow(
      ConflictError,
    );
  });
});
