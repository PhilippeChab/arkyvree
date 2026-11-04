import { describe, expect, test } from "bun:test";

import {
  DND35_COMPLETE_ADVENTURER_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_RULESET_NAME,
} from "@/content/dnd3.5/rulesetNames.ts";
import { db } from "@/server/database/index.ts";
import { Entities, EntityLinks } from "@/server/repositories/index.ts";
import { findSeededRuleset } from "@/tests/support/seed.ts";

/** A seeded ruleset's entity of a kind, by its name. */
async function findId(rulesetName: string, entityType: string, name: string) {
  const { id: rulesetId } = await findSeededRuleset(rulesetName);
  const entity = await Entities.findOne(db, { entityType, name, rulesetId });
  if (!entity) throw new Error(`No ${entityType} named ${name} in ${rulesetName}`);
  return entity.id;
}

/** A seeded class's level, by the class's name and its number. */
async function findLevelId(rulesetName: string, className: string, level: number) {
  const classId = await findId(rulesetName, "classes", className);
  const levels = await Entities.findPositions(db, { entityType: "class-levels", ownerIds: [classId] });
  return levels.find((each) => each.position === level)!.id;
}

/** A seeded class's level's grants of feats: each feat's name, by their numbers, and whether they're numbered from 0. */
async function readGrants(rulesetName: string, className: string, level: number) {
  const levelId = await findLevelId(rulesetName, className, level);
  const links = (await EntityLinks.findMany(db, { fromIds: [levelId], role: "grants" }))
    .filter((link) => link.toType === "feats")
    .toSorted((a, b) => a.ordinal - b.ordinal);
  const feats = await Entities.findMany(db, { entityType: "feats", ids: links.map((link) => link.toId) });
  const names = links.map((link) => feats.find((feat) => feat.id === link.toId)?.name);
  return { names, numbered: links.every((link, index) => link.ordinal === index) };
}

describe("The 3.5 packages' classes' grants", () => {
  test("grant a feature once, a class's own in place of a general feat of its name", async () => {
    expect(await readGrants(DND35_RULESET_NAME, "Monk", 11)).toEqual({
      names: ["Diamond Body (Monk)", "Greater Flurry (Monk)"],
      numbered: true,
    });
    expect((await readGrants(DND35_RULESET_NAME, "Ranger", 11)).names).toEqual(["Combat Style Mastery (Ranger)"]);
    expect((await readGrants(DND35_COMPLETE_ADVENTURER_NAME, "Dungeon Delver", 10)).names).toEqual([
      "Blindsense (Dungeon Delver)",
      "Trap Sense (Dungeon Delver)",
    ]);
    expect((await readGrants(DND35_COMPLETE_WARRIOR_NAME, "Ravager", 4)).names).toEqual(["Pain Touch (Ravager)"]);
    // A level whose table names a skipped feature ("Fast Movement +") counts as one more of the feature it varies
    expect((await readGrants(DND35_COMPLETE_ADVENTURER_NAME, "Scout", 11)).names).toContain("Fast Movement (Scout)");
  });
});
