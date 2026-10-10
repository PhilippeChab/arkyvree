import { describe, expect, test } from "bun:test";

import { Engine, type LevelRequest } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import { addFighterLevels, createSeedCharacter } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const session = makeSession();

/** The levels a fighter with `saved` levels plans, `levels`, refused as the engine refuses them: its message. */
async function refusalOf(saved: number, levels: Omit<LevelRequest, "klassId">[]) {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "fighter", { xp: 10000 });
  await addFighterLevels(session, ctx, characterId, saved);
  const record = (await Characters.findOne(db, { id: characterId }))!;
  const input = await readCharacterInput(db, record);
  const klassId = ctx.klassMap.pc["Fighter"];
  return await withRulesetScope(db, record.rulesetId, async (scope) => {
    const levelUp = Engine.for(scope).character(input).levelUp();
    const request = {
      levels: levels.map((level) => ({ ...level, klassId })),
      picks: { feats: {}, powers: {}, skills: {} },
    };
    try {
      levelUp.planLevels([], request, true);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("The level-up wasn't refused");
  });
}

describe("planLevels", () => {
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
    // A class level taken twice: the plan's second level is the character's third
    expect(
      await refusalOf(1, [
        { abilityIncreases: [], hp: 6, level: 2 },
        { abilityIncreases: [], hp: 6, level: 2 },
      ]),
    ).toBe("Level 3: This level has already been finalized");
  });
});
