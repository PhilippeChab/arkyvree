import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import { addFighterLevels, createSeedCharacter } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { levelUpPlan, type PlannedClassLevel } from "@/tests/support/dnd3.5/levelPlans.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { CHARACTER_XP } from "@/vocabulary/dnd3.5/fields/index.ts";

const session = makeSession();

/** The levels a fighter with `saved` levels plans, `levels`, refused as the engine refuses them: its message. */
async function refusalOf(saved: number, levels: Omit<PlannedClassLevel, "classId">[]) {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "fighter", { fields: { [CHARACTER_XP]: 10000 } });
  await addFighterLevels(session, ctx, characterId, saved);
  const record = (await Characters.findOne(db, { id: characterId }))!;
  const input = await readCharacterInput(db, record);
  const classId = ctx.classMap.pc["Fighter"];
  return await withRulesetScope(db, record.rulesetId, async (scope) => {
    const levelUp = Engine.for(scope).character(input).levelUp();
    const request = levelUpPlan(levels.map((level) => ({ ...level, classId })));
    try {
      levelUp.planLevelUp([], request, true);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("The level-up wasn't refused");
  });
}

describe("planLevelUp", () => {
  test("names a refused level by the character's level, not its place in the level-up", async () => {
    // A fighter 3's fourth level, the plan's first, without the increase it takes
    expect(await refusalOf(3, [{ abilityIncreases: [], hp: 6, level: 4 }])).toBe(
      "Level 4: Ability increase is required at this level",
    );
    // A fighter 2's third and fourth levels: the plan's second is the character's fourth
    expect(
      await refusalOf(2, [
        { abilityIncreases: [], hp: 6, level: 3 },
        { abilityIncreases: [], hp: 6, level: 4 },
      ]),
    ).toBe("Level 4: Ability increase is required at this level");
  });
});
