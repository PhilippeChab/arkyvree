import { describe, expect, test } from "bun:test";

import type { TargetPathKind } from "@/shared/customization/target.ts";
import { getDnd5SeedCtx } from "@/tests/support/dnd5/seed.ts";
import { readTargetPaths } from "@/tests/support/rulesets.ts";

/** The seeded D&D 5th Edition core rules' paths of a kind, by path. */
async function seedPaths(kind: TargetPathKind) {
  const { rulesetId } = await getDnd5SeedCtx();
  return new Map((await readTargetPaths(rulesetId, kind)).paths.map((p) => [p.path, p]));
}

describe("D&D 5th Edition target paths: a weapon's", () => {
  test("offer no proficiency, Finesse or armor training: an item's requirements and a feat's field tell, as 3.5's", async () => {
    for (const kind of ["modifier", "requirement", "template"] as const) {
      const paths = [...(await seedPaths(kind)).keys()];
      expect(
        paths.filter((path) =>
          /^(weapon|items\.weapons\.[^.]+)\.(proficient|finesse)$|^combat\.armortraining\./.test(path),
        ),
      ).toEqual([]);
    }
  });

  test("offer its group's mastery to a feat's modifier, as 3.5's Weapon Focus adds to its group's attack", async () => {
    expect((await seedPaths("modifier")).get("items.weapons.longsword.mastered")).toMatchObject({
      valueType: "boolean",
    });
  });
});
