import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/vocabulary/dnd3.5/fields/index.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "skills" as const;

describe("rulesets entities: skills", () => {
  test("answers a save as a read answers the skill, which says whether its delete is restorable too: its create, its update, and an inherited one's copied on its edit", async () => {
    const { abilityMap, skillMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const read = (entityId: string) => expectOk(entity.$get({ param: { id, entityType, entityId } }));
    const fields = {
      [SKILL_IMPACTED_BY_WEIGHT]: false,
      [SKILL_CHECK_PENALTY_MULTIPLIER]: 1,
      [SKILL_USABLE_WITHOUT_TRAINING]: true,
    };

    const json = { name: "Test Skill", links: { keyAbility: abilityMap["Intelligence"] }, fields };
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json }));
    expect(await read(created.id)).toEqual({ ...created, restorableDelete: false });
    expect(created.links).toMatchObject([
      { role: "keyAbility", toId: abilityMap["Intelligence"], toName: "Intelligence" },
    ]);

    const param = { id, entityType, entityId: created.id };
    const update = { ...json, name: "Renamed Skill", links: { keyAbility: abilityMap["Wisdom"] } };
    const updated = await expectOk(entity.$put({ param, json: update }));
    expect(await read(created.id)).toEqual({ ...updated, restorableDelete: false });
    expect(updated.links).toMatchObject([{ role: "keyAbility", toId: abilityMap["Wisdom"], toName: "Wisdom" }]);

    // The fork's first edit of an inherited skill writes its copy, which the answer and a read by either id give
    const climbId = skillMap["Climb"];
    const climb = { name: "Climb", links: { keyAbility: abilityMap["Dexterity"] }, fields };
    const copied = await expectOk(entity.$put({ param: { id, entityType, entityId: climbId }, json: climb }));
    expect(copied.id).not.toBe(climbId);
    // The copy's delete brings Climb back, from Local Changes
    expect(await read(copied.id)).toEqual({ ...copied, restorableDelete: true });
    expect(await read(climbId)).toEqual({ ...copied, restorableDelete: true });
    expect(copied.links).toMatchObject([{ role: "keyAbility", toId: abilityMap["Dexterity"], toName: "Dexterity" }]);
  });
});
