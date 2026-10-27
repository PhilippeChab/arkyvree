import { describe, expect, test } from "bun:test";

import type { Race } from "@/engine/rulesets/dnd3.5/index.ts";
import { checkReferences } from "@/scripts/ops/validateCharacters/references.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("checkReferences", () => {
  test("counts a character's row naming an entity outside its ruleset chain", async () => {
    const before = await checkReferences();
    const { user } = await createTestUser();
    const elsewhere = await createTestRuleset(user.id);
    const [race] = await Entities.create<Race>(db, "races", { name: "Stray Race", rulesetId: elsewhere.id });
    await createTestCharacter(user.id, { raceId: race.id });

    expect(await checkReferences()).toBe(before + 1);
  });
});
