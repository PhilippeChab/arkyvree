import { describe, expect, test } from "bun:test";

import { ConflictError } from "@/server/errors/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";

const elf = {
  name: "Elf",
  description: "Graceful and long-lived",
  fields: { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 },
};

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("EntitiesService: races", () => {
  test("stores a race's size and base speed", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const created = await EntitiesService.createEntity(session, ruleset.id, "races", elf);
    expect(created).toMatchObject({
      name: elf.name,
      description: elf.description,
      fields: elf.fields,
    });
    const updated = await EntitiesService.updateEntity(session, ruleset.id, "races", created.id, {
      ...elf,
      fields: { [RACE_SIZE]: "Large", [RACE_BASE_SPEED]: 40 },
    });
    expect(updated).toMatchObject({ fields: { [RACE_SIZE]: "Large", [RACE_BASE_SPEED]: 40 } });
  });

  describe("deleting a race characters use", () => {
    test("is refused when a character of the ruleset is of that race", async () => {
      const { user, session, ruleset } = await createTestUserAndRuleset();
      const race = await EntitiesService.createEntity(session, ruleset.id, "races", elf);
      await createTestCharacter(user.id, { rulesetId: ruleset.id, links: { race: race.id } });
      expect(EntitiesService.deleteEntity(session, ruleset.id, "races", race.id)).rejects.toThrow(ConflictError);
    });

    test("is refused when a character of a fork is of that race", async () => {
      const { user, session, ruleset: parent } = await createTestUserAndRuleset();
      const race = await EntitiesService.createEntity(session, parent.id, "races", elf);
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id });
      await createTestCharacter(user.id, { rulesetId: fork.id, links: { race: race.id } });
      expect(EntitiesService.deleteEntity(session, parent.id, "races", race.id)).rejects.toThrow(ConflictError);
    });

    test("is refused when a character of a ruleset using it as an extension is of that race", async () => {
      const { user, session, ruleset: extension } = await createTestUserAndRuleset();
      const race = await EntitiesService.createEntity(session, extension.id, "races", elf);
      const host = await createTestRuleset(user.id, { extensionIds: [extension.id] });
      await createTestCharacter(user.id, { rulesetId: host.id, links: { race: race.id } });
      expect(EntitiesService.deleteEntity(session, extension.id, "races", race.id)).rejects.toThrow(ConflictError);
    });

    test("is allowed in a fork whose parent's characters use the race", async () => {
      // Regression: the in-use check once ignored the ruleset, so a parent's character blocked the fork.
      const { user, session } = await createTestUser();
      const parent = await createTestRuleset(user.id, { status: "Published" });
      const race = await EntitiesService.createEntity(session, parent.id, "races", elf);
      await createTestCharacter(user.id, { rulesetId: parent.id, links: { race: race.id } });
      const fork = await RulesetsService.forkRuleset(session, parent.id, { name: "Race Fork", private: true });

      expect(await EntitiesService.deleteEntity(session, fork.id, "races", race.id)).toBeDefined();
    });
  });
});
