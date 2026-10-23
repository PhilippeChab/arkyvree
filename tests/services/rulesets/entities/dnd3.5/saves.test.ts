import { describe, expect, test } from "bun:test";

import type { Klass, KlassLevel, KlassLevelSave, RulesetAbility } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Entities, Joins } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";

/** A new user's empty ruleset with two abilities. */
async function setup() {
  const { session, ruleset } = await createTestUserAndRuleset();
  const [constitution, wisdom] = await Entities.createMany<RulesetAbility>(
    db,
    "abilities",
    ["Constitution", "Wisdom"].map((name) => ({ name, description: name, rulesetId: ruleset.id })),
  );
  return { session, ruleset, constitution, wisdom };
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("EntitiesService: saves", () => {
  test("stores the ability a save rolls with", async () => {
    const { session, ruleset, constitution, wisdom } = await setup();
    const save = await EntitiesService.createEntity(session, ruleset.id, "saves", {
      name: "Fortitude",
      description: "Physical resistance",
      abilityId: constitution.id,
    });
    expect(save).toMatchObject({ name: "Fortitude", description: "Physical resistance", abilityId: constitution.id });

    const updated = await EntitiesService.updateEntity(session, ruleset.id, "saves", save.id, {
      name: "Will",
      description: "Mental resistance",
      abilityId: wisdom.id,
    });
    expect(updated).toMatchObject({ name: "Will", description: "Mental resistance", abilityId: wisdom.id });
  });

  test("refuses to delete a save that class levels grant", async () => {
    const { session, ruleset, constitution } = await setup();
    const save = await EntitiesService.createEntity(session, ruleset.id, "saves", {
      name: "Fortitude",
      abilityId: constitution.id,
    });
    const [klass] = await Entities.create<Klass>(db, "klasses", {
      name: "Saving Class",
      rulesetId: ruleset.id,
      hd: 10,
    });
    const [klassLevel] = await Entities.create<KlassLevel>(db, "klass_levels", { klassId: klass.id, level: 1 });
    await Joins.createMany<KlassLevelSave>(db, "klass_level_saves", [
      { klassLevelId: klassLevel.id, saveId: save.id, base: 2 },
    ]);

    expect(EntitiesService.deleteEntity(session, ruleset.id, "saves", save.id)).rejects.toThrow(ConflictError);
  });
});
