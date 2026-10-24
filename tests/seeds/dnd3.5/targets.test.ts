import { expect, test } from "bun:test";

import * as RULESET_NAMES from "@/content/dnd3.5/rulesetNames.ts";
import Modules from "@/engine/api/Modules.ts";
import PathChecks from "@/engine/core/paths/PathChecks.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import { readTargetPaths } from "@/tests/support/rulesets.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

import { seededRows } from "./seededRows.ts";

// A target the editor doesn't offer is one an author can't write or save again, and one the engine may not read: a
// Dragon Disciple's boosts on `abilities.strength`, an Ur-priest's slots on `aptitudes.ur-priestspells`
test.each(["modifier", "requirement"] as const)(
  "Every seeded %s targets a path the editor offers, with an operator it offers there",
  async (kind) => {
    // Each ruleset's rows against its own paths: an extension's compose the core rules', not the other way round
    const misfits: string[] = [];
    for (const name of Object.values(RULESET_NAMES)) {
      const rows = await seededRows(name);
      const offered = new Map(
        (await readTargetPaths(rows.rulesetId, kind)).paths.map((path) => [path.path, path.operators]),
      );
      for (const { target, operator } of kind === "modifier" ? rows.modifiers : rows.requirements) {
        if (!target) continue;
        if (!(operator && offered.get(target)?.includes(operator))) misfits.push(`${name}: ${target} ${operator}`);
      }
    }
    expect([...new Set(misfits)]).toEqual([]);
  },
);

// A seeded template never goes through the save check: one the sheet can't evaluate would fail on every character
test("Every seeded template reads what a template of its ruleset can, as its value's type", async () => {
  const errors: string[] = [];
  let templates = 0;
  for (const name of Object.values(RULESET_NAMES)) {
    const rows = await seededRows(name);
    const templatePaths = await readTargetPaths(rows.rulesetId, "template");
    for (const { target, value, valueType } of [...rows.modifiers, ...rows.requirements]) {
      if (!value || !valueType || !isTemplateValue(value)) continue;
      templates++;
      const error = PathChecks.findTemplateValueError(templatePaths, value, valueType);
      if (error) errors.push(`${name}: ${target} = ${value}: ${error}`);
    }
  }
  expect(templates).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

// Nor does a seeded grant: one written as a template or a family's wildcard would be skipped on every character
test("Every seeded modifier on what a grant sets is a grant: one feat, spell or language, set true", async () => {
  const targetPaths = Modules.of(DND35_BASE_RULES).createTargetPaths();
  const errors: string[] = [];
  for (const name of Object.values(RULESET_NAMES)) {
    for (const { target, value } of (await seededRows(name)).modifiers) {
      const error = targetPaths.findGrantError(target, value);
      if (error) errors.push(`${name}: ${error}`);
    }
  }
  expect(errors).toEqual([]);
});
