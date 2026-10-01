import { describe, expect, test } from "bun:test";

import { abilitiesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Klasses, KlassLevels, KlassLevelSaves } from "@/server/repositories/index.ts";
import { SavesMethods } from "@/server/services/rulesets/SavesService.ts";
import { createTestUserAndRuleset, insertRows } from "@/tests/helpers.ts";

/** A new user's empty ruleset with two abilities. */
async function setup() {
  const { session, ruleset } = await createTestUserAndRuleset();
  const [constitution, wisdom] = await insertRows(
    abilitiesInRules,
    ["Constitution", "Wisdom"].map((name) => ({ name, description: name, rulesetId: ruleset.id })),
  );
  return { session, ruleset, constitution, wisdom };
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("SavesService", () => {
  test("stores the ability a save rolls with", async () => {
    const { session, ruleset, constitution, wisdom } = await setup();
    const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
      name: "Fortitude",
      description: "Physical resistance",
      abilityId: constitution.id,
    });
    expect(save).toMatchObject({ name: "Fortitude", description: "Physical resistance", abilityId: constitution.id });

    const updated = await SavesMethods.updateRulesetSave(session, ruleset.id, save.id, {
      name: "Will",
      description: "Mental resistance",
      abilityId: wisdom.id,
    });
    expect(updated).toMatchObject({ name: "Will", description: "Mental resistance", abilityId: wisdom.id });
  });

  test("refuses to delete a save that class levels grant", async () => {
    const { session, ruleset, constitution } = await setup();
    const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
      name: "Fortitude",
      abilityId: constitution.id,
    });
    const [klass] = await Klasses.create(db, { name: "Saving Class", rulesetId: ruleset.id, hd: 10 });
    const [klassLevel] = await KlassLevels.create(db, { klassId: klass.id, level: 1 });
    await KlassLevelSaves.createMany(db, [{ klassLevelId: klassLevel.id, saveId: save.id, base: 2 }]);

    await expect(SavesMethods.deleteRulesetSave(session, ruleset.id, save.id)).rejects.toThrow(ConflictError);
  });
});
