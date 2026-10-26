import { describe, expect, test } from "bun:test";

import type { EntityWrites } from "@/engine/index.ts";
import type { Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Requirements } from "@/server/repositories/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import { measure } from "@/tests/support/database.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

/** Writes that write nothing but what's given. */
function writesOf(writes: Partial<EntityWrites>): EntityWrites {
  return { ...writes };
}

/** A spell of a fork of its own. */
async function createSpell() {
  const ruleset = await createSeededTestRuleset(makeSession().userId);
  const [spell] = await Entities.create<Spell>(db, "spells", { name: "Probe Spell", rulesetId: ruleset.id });
  return { entity: { entityId: spell.id, entityType: "spells" } as const, rulesetId: ruleset.id };
}

describe("An entity's writes", () => {
  test("set the requirement they plan on the entity", async () => {
    const { entity, rulesetId } = await createSpell();
    const requirement = {
      level: "1",
      operator: "greater_than",
      target: "classes.wizard.level",
      value: "1",
      valueType: "number",
    } as const;

    await withRulesetScope(db, rulesetId, async (scope) =>
      writeEntityWrites(db, scope, entity, writesOf({ requirement })),
    );

    const stored = await Requirements.findMany(db, { entityIds: [entity.entityId] });
    expect(stored).toEqual([expect.objectContaining({ ...entity, ...requirement })]);
  });

  test("write nothing beside the row when they plan nothing", async () => {
    const { entity, rulesetId } = await createSpell();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const { timing } = await measure(() => writeEntityWrites(db, scope, entity, writesOf({})));
      expect(timing).toMatchObject({ queryCount: 0 });
    });
  });
});
