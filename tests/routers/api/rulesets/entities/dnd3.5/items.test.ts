import { describe, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "items" as const;

describe("rulesets entities: items", () => {
  test("refuses the templates of a type no item is based on a template of", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.templates.$get({ param: { id, entityType }, query: { type: "Ring" } }), 400);
  });

  test("rejects no variant, or more than 50, in one request", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const source = await expectOk(kinds.$post({ param: { id, entityType }, json: { name: "Bulk Cap Source" } }));
    const variants = Array.from({ length: 51 }, (_, i) => ({ name: `Cap Variant ${i}` }));
    await expectStatus(
      entity.variants.$post({ param: { id, entityType, entityId: source.id }, json: { variants } }),
      400,
    );
    await expectStatus(
      entity.variants.$post({ param: { id, entityType, entityId: source.id }, json: { variants: [] } }),
      400,
    );
  });
});
