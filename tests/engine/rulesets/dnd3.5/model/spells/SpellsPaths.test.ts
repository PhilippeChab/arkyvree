import { describe, expect, test } from "bun:test";

import type { Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import SpellsPaths from "@/engine/rulesets/dnd3.5/model/spells/SpellsPaths.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Rulesets } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { SPELL_COMPONENT } from "@/vocabulary/dnd3.5/properties/index.ts";

describe("SpellsPaths.generateSpellPaths", () => {
  test("offers a spell's values of a field as a list: one of them required, or added or taken", async () => {
    const { rulesetId } = await getSeedCtx();
    const enthrall = (await Entities.findOne<Spell>(db, { entityType: "spells", name: "Enthrall", rulesetId }))!;
    const rulesetData = await RulesetViews.getData((await Rulesets.findOne(db, { id: rulesetId }))!);
    const fields = Object.keys(rulesetData.valuesOf(enthrall.id).fields);
    const operatorsOf = (kind: "modifier" | "requirement") =>
      SpellsPaths.generateSpellPaths(
        [{ ...enthrall, spellsAptitudesInRules: [], fields }],
        new Map(),
        new Set(),
        kind,
      ).find((path) => path.path === `spells.enthrall.fields.${SPELL_COMPONENT}`)?.operators;
    expect([operatorsOf("requirement"), operatorsOf("modifier")]).toEqual([
      ["contains", "not_contains"],
      ["add", "subtract"],
    ]);
  });
});
