import { expect, test } from "bun:test";

import type { Language } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";

test("rows that tie on a list's sort come in one order, by id, each on one page", async () => {
  const { ruleset } = await createTestUserAndRuleset();
  const createdAt = new Date().toISOString();
  const rows = await Entities.createMany<Language>(
    db,
    "languages",
    ["Aquan", "Ignan", "Terran", "Auran", "Sylvan", "Druidic"].map((name) => ({
      rulesetId: ruleset.id,
      name,
      type: "Exotic",
      createdAt,
    })),
  );
  const ids: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const result = await EntitiesService.getEntities(
      ruleset.id,
      "languages",
      { childOnly: true, orderBy: "createdAt" },
      { limit: 2, page },
    );
    ids.push(...result.items.map((language) => language.id));
  }
  expect(ids).toEqual(rows.map((row) => row.id).sort());
});
