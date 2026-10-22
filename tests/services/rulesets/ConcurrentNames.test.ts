import { afterAll, expect, test } from "bun:test";

import { createTestPool } from "@/server/database/test.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

const pool = createTestPool();
afterAll(() => pool.end());

test("refuses a name a concurrent write took after the rename's check read it free, as a taken name", async () => {
  const { user, session } = await createTestUser();
  const ruleset = await createTestRuleset(user.id);
  const name = `Raced ${uniqueId()}`;
  // The other write holds the name uncommitted while the rename's check reads it free, then commits it
  const raced = runWhileLocked(
    pool,
    (blockerDb) =>
      Rulesets.create(blockerDb, { baseRules: DND35_BASE_RULES, description: "", name, private: true, userId: null }),
    () => RulesetsService.updateRuleset(session, ruleset.id, { description: "", name }),
    "COMMIT",
  );
  try {
    expect(raced).rejects.toThrow(new ConflictError("A ruleset with this name already exists"));
    await raced.catch(() => undefined);
  } finally {
    await pool.query(`delete from rules.rulesets where name = $1`, [name]);
  }
});
