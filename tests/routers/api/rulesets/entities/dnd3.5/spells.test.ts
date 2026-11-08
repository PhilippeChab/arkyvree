import { describe, test } from "bun:test";

import { api, expectStatus } from "@/tests/support/api.ts";
import { createSeededForkWithAptitude } from "@/tests/support/dnd3.5/rulesets.ts";

const entityType = "spells" as const;
const kinds = api.api.rulesets[":id"].entities[":entityType"];

describe("rulesets entities: spells", () => {
  test("rejects a spell without a name, with malformed aptitudes or a level above 9", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();
    for (const json of [
      { name: "" },
      { name: "Spell", links: { listedIn: aptitudeId } },
      { name: "Spell", links: { listedIn: [{ toId: aptitudeId, tier: 10 }] } },
    ])
      await expectStatus(kinds.$post({ param: { id, entityType }, json }), 400);
  });
});
