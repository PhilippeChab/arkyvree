import { describe, expect, test } from "bun:test";

import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import { db } from "@/server/database/index.ts";
import { Powers, Properties } from "@/server/repositories/index.ts";
import { SPELL_COMPONENT } from "@/shared/dnd3.5/properties/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

describe("PowersPaths.generatePowerPaths", () => {
  test("offers a spell's values of a type as a list: one of them required, or added or taken", async () => {
    const { rulesetId } = await getSeedCtx();
    const enthrall = (await Powers.findOne(db, { name: "Enthrall", rulesetId }))!;
    const properties = await Properties.findMany(db, { entityIds: [enthrall.id], entityType: "powers" });
    const operatorsOf = (kind: "modifier" | "requirement") =>
      PowersPaths.generatePowerPaths(
        [{ ...enthrall, powersAptitudesInRules: [], properties }],
        new Map(),
        new Set(),
        kind,
      ).find((path) => path.path === `powers.enthrall.properties.${SPELL_COMPONENT}`)?.operators;
    expect([operatorsOf("requirement"), operatorsOf("modifier")]).toEqual([
      ["contains", "not_contains"],
      ["add", "subtract"],
    ]);
  });
});
