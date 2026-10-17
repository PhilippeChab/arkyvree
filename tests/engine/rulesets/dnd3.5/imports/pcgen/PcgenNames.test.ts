import { describe, expect, test } from "bun:test";

import PcgenNames from "@/engine/rulesets/dnd3.5/imports/pcgen/PcgenNames.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/** The names of the seeded ruleset, as an import finds them. */
async function seededNames() {
  const { rulesetId } = await getSeedCtx();
  return new PcgenNames(await RulesetViews.getData((await Rulesets.findOne(db, { id: rulesetId }))!));
}

describe("PcgenNames", () => {
  test("finds an item PCGen words its own way, through the table or the wordings", async () => {
    const names = await seededNames();
    expect(names.findItem("Sword (Bastard)")?.name).toBe("Bastard Sword");
    expect(names.findItem("Shield (Heavy/Metal)")?.name).toBe("Heavy Steel Shield");
    expect(names.findItem("Rope (Hempen/50 Ft.)")?.name).toBe("Rope, hempen (50 ft.)");
    expect(names.findItem("Backpack")?.name).toBe("Backpack (empty)");
    expect(names.findItem("Pouch (Belt)")?.name).toBe("Pouch, belt (empty)");
    expect(names.findItem("Ring (Freedom of Movement)")?.name).toBe("Ring of Freedom of Movement");
    expect(names.findItem("Potion (Cure Light Wounds)")).toBeUndefined();
  });

  test("finds a feat by its choice, or by its name when the ruleset keeps it whole", async () => {
    const names = await seededNames();
    expect(names.findFeat("Weapon Focus", "Sword (Bastard)")?.name).toBe("Weapon Focus: Bastard Sword");
    expect(names.findFeat("Skill Focus", "Diplomacy")?.name).toBe("Skill Focus: Diplomacy");
    expect(names.findFeat("Spell Mastery", "Magic Missile,Shield")?.name).toBe("Spell Mastery");
  });

  test("finds a skill by its name, the one it opens, or its subtype's base", async () => {
    const names = await seededNames();
    expect(names.findSkill("Knowledge (Nobility)")?.name).toBe("Knowledge (Nobility and Royalty)");
    expect(names.findSkill("Craft (Weaponsmithing)")?.name).toBe("Craft");
    // A name of another script the ruleset hasn't finds nothing, never its first skill
    expect(names.findSkill("Ψυχή")).toBeUndefined();
  });

  test("compares names without accents", async () => {
    expect((await seededNames()).findRace("Half-Élf")?.name).toBe("Half-Elf");
  });

  test("finds a player's race alone: a familiar's isn't a character's", async () => {
    expect((await seededNames()).findRace("Cat")).toBeUndefined();
  });
});
