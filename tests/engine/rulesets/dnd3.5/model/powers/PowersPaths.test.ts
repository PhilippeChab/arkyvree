import { describe, expect, test } from "bun:test";

import type { Power } from "@/engine/index.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Properties } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { SPELL_COMPONENT } from "@/vocabulary/dnd3.5/properties/index.ts";

describe("PowersPaths.generatePowerPaths", () => {
  test("offers a spell's values of a type as a list: one of them required, or added or taken", async () => {
    const { rulesetId } = await getSeedCtx();
    const enthrall = (await Entities.findOne<Power>(db, { entityType: "powers", name: "Enthrall", rulesetId }))!;
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
