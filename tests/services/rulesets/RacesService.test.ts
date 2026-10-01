import { describe, expect, test } from "bun:test";

import { ConflictError } from "@/server/errors/index.ts";
import { RacesMethods } from "@/server/services/rulesets/RacesService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { createTestCharacter, createTestRuleset, createTestUser, createTestUserAndRuleset } from "@/tests/helpers.ts";

const elf = { name: "Elf", description: "Graceful and long-lived", size: "Medium" as const, baseSpeed: 30 };

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("RacesService", () => {
  test("stores a race's size and base speed", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const created = await RacesMethods.createRulesetRace(session, ruleset.id, elf);
    expect(created).toMatchObject(elf);
    const updated = await RacesMethods.updateRulesetRace(session, ruleset.id, created.id, {
      ...elf,
      size: "Large",
      baseSpeed: 40,
    });
    expect(updated).toMatchObject({ size: "Large", baseSpeed: 40 });
  });

  describe("deleting a race characters use", () => {
    test("is refused when a character of the ruleset is of that race", async () => {
      const { user, session, ruleset } = await createTestUserAndRuleset();
      const race = await RacesMethods.createRulesetRace(session, ruleset.id, elf);
      await createTestCharacter(user.id, { rulesetId: ruleset.id, raceId: race.id });
      await expect(RacesMethods.deleteRulesetRace(session, ruleset.id, race.id)).rejects.toThrow(ConflictError);
    });

    test("is refused when a character of a fork is of that race", async () => {
      const { user, session, ruleset: parent } = await createTestUserAndRuleset();
      const race = await RacesMethods.createRulesetRace(session, parent.id, elf);
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
      await createTestCharacter(user.id, { rulesetId: fork.id, raceId: race.id });
      await expect(RacesMethods.deleteRulesetRace(session, parent.id, race.id)).rejects.toThrow(ConflictError);
    });

    test("is refused when a character of a ruleset using it as an extension is of that race", async () => {
      const { user, session, ruleset: extension } = await createTestUserAndRuleset();
      const race = await RacesMethods.createRulesetRace(session, extension.id, elf);
      const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });
      await createTestCharacter(user.id, { rulesetId: host.id, raceId: race.id });
      await expect(RacesMethods.deleteRulesetRace(session, extension.id, race.id)).rejects.toThrow(ConflictError);
    });

    test("is allowed in a fork whose parent's characters use the race", async () => {
      // Regression: the in-use check once ignored the ruleset, so a parent's character blocked the fork.
      const { user, session } = await createTestUser();
      const parent = await createTestRuleset(user.id, { status: "Published" });
      const race = await RacesMethods.createRulesetRace(session, parent.id, elf);
      await createTestCharacter(user.id, { rulesetId: parent.id, raceId: race.id });
      const fork = await RulesetsMethods.forkRuleset(session, parent.id, { name: "Race Fork", private: true });

      expect(await RacesMethods.deleteRulesetRace(session, fork.id, race.id)).toBeDefined();
    });
  });
});
