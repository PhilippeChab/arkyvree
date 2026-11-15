import { describe, expect, test } from "bun:test";

import { DND35_EPIC_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { createSeededTestRulesetWithExtensions, readView } from "@/tests/support/rulesets.ts";
import { CLASS_LEVEL_BAB } from "@/vocabulary/dnd3.5/fields/index.ts";

import { describeRequirement, seededRows } from "./seededRows.ts";

/** The features a class's level grants, by name: the extension's own (its bonus feats') and the core rules'. */
async function grantsAt(klass: string, level: number) {
  const rows = await seededRows(DND35_EPIC_NAME);
  const names = new Map([...(await seededRows()).feats, ...rows.feats].map((feat) => [feat.id, feat.name]));
  return rows.linksByRole.grants.feats
    .filter((grant) => grant.fromId === rows.classLevel(klass, level).id)
    .map((grant) => names.get(grant.toId))
    .sort();
}

describe("The seeded Epic SRD 3.5 extension", () => {
  test("gives the core classes their levels 21 to 40, each with their 20th's base attack, saves and skill points", async () => {
    const rows = await seededRows(DND35_EPIC_NAME);
    const fighter = rows.classes.filter((klass) => klass.name === "Fighter");
    // Its own copy of the Fighter, which stands for the core one: the core's levels, its own past 20th
    expect(fighter).toHaveLength(1);
    const positions = rows.classLevels
      .filter((level) => level.ownerId === fighter[0].id)
      .map(({ position }) => position);
    expect(positions.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    const fork = await createSeededTestRulesetWithExtensions(SEED_USER_ID);
    const view = Dnd35View.of(await readView(fork.id));
    const forkFighter = view.classes.find((klass) => klass.name === "Fighter" && klass.partition === "pc")!;
    expect(
      view.classLevelsByClass
        .get(forkFighter.id)
        ?.map(({ position }) => position)
        .sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    const saves = (level: number) =>
      rows.linksByRole.baseBonus
        .filter((link) => link.fromId === rows.classLevel("Fighter", level).id)
        .map((link) => link.amount)
        .sort();
    expect(saves(25)).toEqual(saves(20));
    expect(rows.valuesOf(rows.classLevel("Fighter", 33).id, CLASS_LEVEL_BAB)).toEqual([20]);
    // Its class skills, the copy's own
    expect(rows.linksByRole.classSkill.filter((link) => link.fromId === fighter[0].id).length).toBeGreaterThan(0);
  });

  test("grants each class's features where their patterns go on past 20th, and its bonus feats", async () => {
    expect(await grantsAt("Fighter", 21)).toEqual([]);
    expect(await grantsAt("Fighter", 22)).toEqual(["Epic Bonus Feat (Fighter)"]);
    expect(await grantsAt("Barbarian", 24)).toEqual([
      "Epic Bonus Feat (Barbarian)",
      "Rage (Barbarian)",
      "Trap Sense (Barbarian)",
    ]);
    expect(await grantsAt("Rogue", 21)).toEqual(["Sneak Attack (Rogue)", "Trap Sense (Rogue)"]);
    expect(await grantsAt("Monk", 35)).toEqual(["Epic Bonus Feat (Monk)"]);
  });

  test("gives the epic feats, each of 21st level, in the General pool and the bonus feat lists that name them", async () => {
    const rows = await seededRows(DND35_EPIC_NAME);
    const toughness = rows.feat("Epic Toughness");
    expect(toughness.listedIn.map((link) => link.toName)).toEqual(
      expect.arrayContaining(["General", "Epic Fighter Bonus Feat", "Epic Barbarian Bonus Feat"]),
    );
    expect(rows.requirementsOf(toughness.id).map(describeRequirement)).toContain(
      "1 identity.meta.level greater_than_or_equal 21",
    );
    // A core fighter bonus feat joins the epic fighter's list, a rogue's special ability the epic rogue's
    expect(rows.feat("Dodge").listedIn.map((link) => link.toName)).toContain("Epic Fighter Bonus Feat");
    expect(rows.feat("Opportunist (Rogue Special Ability)").listedIn.map((link) => link.toName)).toContain(
      "Epic Rogue Bonus Feat",
    );
    // A feat whose prerequisite is a DMG prestige class's feature is left out
    expect(rows.feats.some((feat) => feat.name === "Improved Death Attack")).toBe(false);
  });
});
