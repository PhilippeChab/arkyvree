import { expect, test } from "bun:test";

import * as RULESET_NAMES from "@/database/packages/dnd35/names.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { seededRows } from "@/tests/seeds/seededRows.ts";

test("Every seeded check of a feat names a feat or a family of the seeded rules", async () => {
  const rulesets = [];
  for (const name of Object.values(RULESET_NAMES)) rulesets.push(await seededRows(name));
  const feats = new Set(rulesets.flatMap((rows) => rows.feats.map((feat) => stripSeparators(feat.name))));
  const families = new Set(
    rulesets.flatMap((rows) =>
      rows.properties.filter((p) => p.type === "FEAT_FAMILY").map((p) => stripSeparators(p.value)),
    ),
  );
  // A feat by its name (`feats.dodge.possessed`, a stackable one's `.count`), a family by its wildcard
  // (`feats.metamagic.*.possessed`) or its count (`feats.luck.count`)
  const namesNothing = (path: string) => {
    const [category, name, next] = path.split(".");
    if (category !== "feats") return false;
    if (next === "*") return !families.has(name);
    return !feats.has(name) && !(next === "count" && families.has(name));
  };

  // The checks' targets, and the paths their formulas read ("{{ 3 - [feats.itemcreation.count] }}")
  const paths = rulesets.flatMap((rows) =>
    [...rows.requirements, ...rows.modifiers].flatMap(({ target, value }) => [
      ...(target ? [target] : []),
      ...[...(value ?? "").matchAll(/\[([^\]]+)\]/g)].map(([, path]) => path.trim()),
    ]),
  );
  expect([...new Set(paths.filter(namesNothing))]).toEqual([]);
});
