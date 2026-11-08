import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A class's URL segment */
const entityType = "classes" as const;
const kinds = api.api.rulesets[":id"].entities[":entityType"];

describe("rulesets entities: classes", () => {
  test("rejects a class without a name, with a non-standard hit die or with a key its body doesn't take", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$post({ param: { id, entityType }, json: { name: "" } }), 400);
    // Its hit die is one its field's values hold: d4, d6, d8, d10 or d12
    const json = { name: "Bad Class", fields: { [CLASS_HD]: 5 } };
    const refused = await expectStatus(kinds.$post({ param: { id, entityType }, json }), 400);
    expect(await refused.json()).toMatchObject({ issues: [{ category: `fields.${CLASS_HD}` }] });
    const extra = { name: "Extra Class", extra: 1 } as never;
    const unknown = await expectStatus(kinds.$post({ param: { id, entityType }, json: extra }), 400);
    expect(await unknown.json()).toMatchObject({
      issues: [{ category: "json", message: 'Unrecognized key: "extra"' }],
    });
  });
});
