import { describe, expect, test } from "bun:test";

import { toV1Progression } from "@/server/routers/v1/translators/entities.ts";
import { listV1ProgressionKeys } from "@/server/routers/v1/translators/rules.ts";
import { RulesService } from "@/server/services/rules/index.ts";
import { findSeededBase } from "@/tests/support/v1.ts";

describe("toV1Progression", () => {
  test("answers a progression's pools and the values v1's rules name, never another key of the app's", async () => {
    const { baseRules } = await findSeededBase();
    const description = RulesService.getRules()[baseRules];
    const named = listV1ProgressionKeys(description);
    expect(named.length).toBeGreaterThan(0);
    const values = Object.fromEntries(named.map((key, index) => [key, index]));
    const pools = [{ id: "pool", name: "Pool", picks: { owned: 1 } }];
    // The app's answer, with a value of its own v1's rules don't name
    const progression = { ...values, appOnly: true, pools };

    expect(toV1Progression(progression, description)).toEqual({ ...values, pools });
  });
});
