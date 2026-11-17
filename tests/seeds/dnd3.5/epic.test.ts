import { describe, expect, test } from "bun:test";

import {
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_EPIC_NAME,
} from "@/content/dnd3.5/rulesetNames.ts";
import { addEpicLevels } from "@/database/seeders/dnd3.5/updates.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Entities, EntityLinks } from "@/server/repositories/index.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { CLASS_LEVEL_BAB, FEAT_EPIC } from "@/vocabulary/dnd3.5/fields/index.ts";

import { describeRequirement, seededRows } from "./seededRows.ts";

/** The features a core class's level grants, by name. */
async function grantsAt(klass: string, level: number) {
  const rows = await seededRows();
  const names = new Map(rows.feats.map((feat) => [feat.id, feat.name]));
  return rows.linksByRole.grants.feats
    .filter((grant) => grant.fromId === rows.classLevel(klass, level).id)
    .map((grant) => names.get(grant.toId))
    .sort();
}

describe("The seeded core rules' epic levels", () => {
  test("give the core classes their levels 21 to 40, each with their 20th's base attack, saves and skill points", async () => {
    const rows = await seededRows();
    const fighter = rows.classes.filter((klass) => klass.name === "Fighter" && klass.partition === "pc");
    expect(fighter).toHaveLength(1);
    const positions = rows.classLevels
      .filter((level) => level.ownerId === fighter[0].id)
      .map(({ position }) => position);
    expect(positions.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    const saves = (level: number) =>
      rows.linksByRole.baseBonus
        .filter((link) => link.fromId === rows.classLevel("Fighter", level).id)
        .map((link) => link.amount)
        .sort();
    expect(saves(25)).toEqual(saves(20));
    expect(rows.valuesOf(rows.classLevel("Fighter", 33).id, CLASS_LEVEL_BAB)).toEqual([20]);
  });

  test("grant each class's features where their patterns go on past 20th, and its epic bonus feats", async () => {
    expect(await grantsAt("Fighter", 21)).toEqual([]);
    expect(await grantsAt("Fighter", 22)).toEqual(["Epic Bonus Feat (Fighter)"]);
    expect(await grantsAt("Barbarian", 24)).toEqual([
      "Epic Bonus Feat (Barbarian)",
      "Rage (Barbarian)",
      "Trap Sense (Barbarian)",
    ]);
    expect(await grantsAt("Rogue", 21)).toEqual(["Sneak Attack (Rogue)", "Trap Sense (Rogue)"]);
    expect(await grantsAt("Monk", 35)).toEqual(["Epic Bonus Feat (Monk)"]);
    expect(await grantsAt("Ranger", 25)).toEqual(["Favored Enemy (Ranger)", "Favored Enemy Specialization (Ranger)"]);
  });

  test("go on with a class's level bonuses: a monk's unarmored AC every 5 levels, its speed every 3", async () => {
    const rows = await seededRows();
    const targetsAt = (level: number) =>
      rows
        .modifiersOf(rows.classLevel("Monk", level).id)
        .map(({ target, value }) => `${target} ${value}`)
        .sort();
    expect([targetsAt(21), targetsAt(24), targetsAt(25), targetsAt(26)]).toEqual([
      ["combat.speed.base 10"],
      ["combat.speed.base 10"],
      ["combat.ac.misc 1"],
      [],
    ]);
    // The AC bonus keeps its gate: no armor, no shield, a light load
    const ac = rows.modifiersOf(rows.classLevel("Monk", 25).id)[0];
    expect(rows.requirementsOf(ac.id).length).toBeGreaterThan(0);
  });

  test("list the core feats an epic bonus feat list names, or takes with a pool it joins", async () => {
    const rows = await seededRows();
    // A core fighter bonus feat joins the epic fighter's list, a rogue's special ability the epic rogue's
    expect(rows.feat("Dodge").listedIn.map((link) => link.toName)).toContain("Epic Fighter Bonus Feat");
    expect(rows.feat("Opportunist (Rogue Special Ability)").listedIn.map((link) => link.toName)).toContain(
      "Epic Rogue Bonus Feat",
    );
  });

  test("reach a fork's own copy of a base class it has 20 levels of, and its copy of a core feat, by the update", async () => {
    const ctx = await getSeedCtx();
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const levelsOf = async (classId: string) =>
      await Entities.findMany<KlassLevel>(db, { entityType: "class-levels", ownerIds: [classId] });
    // Copies as a fork made them before the core rules went past 20th: a Fighter of 20 levels, a Rogue it shortened to
    // 19, a Dodge in no epic pool
    const trimTo = async (classId: string, last: number) => {
      for (const { id, position } of await levelsOf(classId))
        if (position > last) await Entities.delete(db, { entityType: "class-levels", id });
    };
    const fighter = await copyEntity(db, "classes", ctx.classMap.pc["Fighter"], fork);
    await trimTo(fighter.id, 20);
    const rogue = await copyEntity(db, "classes", ctx.classMap.pc["Rogue"], fork);
    await trimTo(rogue.id, 19);
    const dodge = await copyEntity(db, "feats", ctx.featMap["Dodge"], fork);
    const epicFighter = ctx.aptMap["Epic Fighter Bonus Feat"];
    await EntityLinks.delete(db, { fromId: dodge.id, role: "listedIn", toId: epicFighter });

    await addEpicLevels(db);

    // The Fighter's 40 levels, its 22nd granting its epic bonus feat; the Rogue its own 19; Dodge in the epic pool
    const fighterLevels = await levelsOf(fighter.id);
    expect(fighterLevels.map(({ position }) => position).toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    const level22 = fighterLevels.find(({ position }) => position === 22)!;
    const grants = await EntityLinks.findMany(db, { fromIds: [level22.id], role: "grants" });
    expect(grants.map(({ toId }) => toId)).toEqual([ctx.featMap["Epic Bonus Feat (Fighter)"]]);
    expect(await levelsOf(rogue.id)).toHaveLength(19);
    const listed = await EntityLinks.findMany(db, { fromIds: [dodge.id], role: "listedIn" });
    expect(listed.map(({ toId }) => toId)).toContain(epicFighter);
  });

  test("are what the core rules' update to v2 adds: run on the seeded rules, it adds nothing", async () => {
    const before = await seededRows();
    await addEpicLevels(db);
    const after = await seededRows();
    expect(after.classLevels.length).toBe(before.classLevels.length);
    expect(after.feats.length).toBe(before.feats.length);
    expect(after.linksByRole.listedIn.feats?.length ?? 0).toBe(before.linksByRole.listedIn.feats?.length ?? 0);
  });
});

describe("The seeded Epic SRD 3.5 extension", () => {
  test("gives the epic feats, each of 21st level, in the General pool and the bonus feat lists that name them", async () => {
    const rows = await seededRows(DND35_EPIC_NAME);
    const toughness = rows.feat("Epic Toughness");
    expect(toughness.listedIn.map((link) => link.toName)).toEqual(
      expect.arrayContaining(["General", "Epic Fighter Bonus Feat", "Epic Barbarian Bonus Feat"]),
    );
    expect(rows.requirementsOf(toughness.id).map(describeRequirement)).toContain(
      "1 identity.meta.level greater_than_or_equal 21",
    );
    // Only feats: the core rules hold the classes' epic levels
    expect(rows.classes).toEqual([]);
    // A feat's effect on the sheet, a per-weapon feat's on its own weapon, and a per-crossbow feat's prerequisites
    expect(rows.modifiersOf(rows.feat("Great Strength").id).map(({ target, value }) => `${target} ${value}`)).toEqual([
      "abilities.strength.misc 1",
    ]);
    expect(
      rows.modifiersOf(rows.feat("Epic Weapon Focus: Longsword").id).map(({ target, value }) => `${target} ${value}`),
    ).toEqual(["items.weapons.longsword.tohit.misc 2"]);
    expect(rows.requirementsOf(rows.feat("Instant Reload: Light Crossbow").id).map(describeRequirement)).toEqual([
      "1 feats.quickdraw.possessed equal true",
      "2 feats.rapidreloadlightcrossbow.possessed equal true",
      "3 feats.weaponfocuslightcrossbow.possessed equal true",
      "4 identity.meta.level greater_than_or_equal 21",
    ]);
    // A feat whose prerequisite is a DMG prestige class's feature is left out
    expect(rows.feats.some((feat) => feat.name === "Improved Death Attack")).toBe(false);
  });
});

describe("A Complete book's own epic feats", () => {
  test("are its own, flagged Epic and of 21st level, and its reprints of the Epic extension's feats aren't", async () => {
    const rows = await seededRows(DND35_COMPLETE_DIVINE_NAME);
    const devotion = rows.feat("Epic Devotion");
    expect(rows.valuesOf(devotion.id, FEAT_EPIC)).toEqual([true]);
    expect(rows.requirementsOf(devotion.id).map(describeRequirement)).toContain(
      "3 identity.meta.level greater_than_or_equal 21",
    );
    // Its Bonus Domain, kept before, too
    expect(rows.requirementsOf(rows.feat("Bonus Domain").id).map(describeRequirement)).toContain(
      "3 identity.meta.level greater_than_or_equal 21",
    );
    // Complete Warrior's Epic Toughness is the Epic extension's
    const warrior = await seededRows(DND35_COMPLETE_WARRIOR_NAME);
    expect(warrior.feats.some((feat) => feat.name === "Epic Toughness")).toBe(false);
    expect(warrior.feats.some((feat) => feat.name === "Epic Sunder")).toBe(true);
  });
});
