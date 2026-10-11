import { expect, test } from "bun:test";

import { languagesInRules } from "@/drizzle/schema.ts";
import { LanguagesService } from "@/server/services/rulesets/languages/index.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";

test("rows that tie on a list's sort come in one order, by id, each on one page", async () => {
  const { ruleset } = await createTestUserAndRuleset();
  const createdAt = new Date().toISOString();
  const rows = await insertRows(
    languagesInRules,
    ["Aquan", "Ignan", "Terran", "Auran", "Sylvan", "Druidic"].map((name) => ({
      rulesetId: ruleset.id,
      name,
      type: "Exotic",
      createdAt,
    })),
  );
  const ids: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const result = await LanguagesService.getLanguages(
      ruleset.id,
      { childOnly: true, orderBy: "createdAt" },
      { limit: 2, page },
    );
    ids.push(...result.items.map((language) => language.id));
  }
  expect(ids).toEqual(rows.map((row) => row.id).sort());
});
