import { describe, expect, test } from "bun:test";

import type { EntityWrites, Power } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Properties, Requirements } from "@/server/repositories/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import { measure } from "@/tests/support/database.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import { SPELL_DURATION, SPELL_SCHOOL, SPELL_SUBSCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

/** Writes that write nothing but what's given. */
function writesOf(writes: Partial<EntityWrites>): EntityWrites {
  return { ...writes };
}

/** A power of a fork of its own, with a property its writes don't keep a field in. */
async function createPower() {
  const ruleset = await createSeededTestRuleset(makeSession().userId);
  const [power] = await Entities.create<Power>(db, "powers", { name: "Probe Spell", rulesetId: ruleset.id });
  await Properties.createMany(db, [
    { entityId: power.id, entityType: "powers", type: SPELL_DURATION, value: "1 round" },
    { entityId: power.id, entityType: "powers", type: SPELL_SCHOOL, value: "Evocation" },
  ]);
  return { entity: { entityId: power.id, entityType: "powers" } as const, rulesetId: ruleset.id };
}

describe("An entity's writes", () => {
  test("keep its fields in its properties: those of their types give way, its others stay", async () => {
    const { entity, rulesetId } = await createPower();
    const properties = {
      types: [SPELL_SCHOOL, SPELL_SUBSCHOOL],
      values: [{ type: SPELL_SCHOOL, value: "Conjuration" }],
    };

    const written = await withRulesetScope(db, rulesetId, async (scope) =>
      writeEntityWrites(db, scope, entity, writesOf({ properties })),
    );

    expect(written).toEqual([{ ...entity, type: SPELL_SCHOOL, value: "Conjuration" }]);
    const stored = await Properties.findMany(db, { entityIds: [entity.entityId], entityType: "powers" });
    expect(stored.map(({ type, value }) => `${type}=${value}`).toSorted()).toEqual([
      `${SPELL_DURATION}=1 round`,
      `${SPELL_SCHOOL}=Conjuration`,
    ]);
  });

  test("set the requirement they plan on the entity", async () => {
    const { entity, rulesetId } = await createPower();
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
    const { entity, rulesetId } = await createPower();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const { result, timing } = await measure(() => writeEntityWrites(db, scope, entity, writesOf({})));
      expect(result).toEqual([]);
      expect(timing).toMatchObject({ queryCount: 0 });
    });
  });
});
