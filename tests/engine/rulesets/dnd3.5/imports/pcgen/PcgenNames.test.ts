import { describe, expect, test } from "bun:test";

import PcgenNames from "@/engine/rulesets/dnd3.5/imports/pcgen/PcgenNames.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/** The names of the seeded ruleset, as an import finds them. */
async function seededNames() {
  const { rulesetId } = await getSeedCtx();
  return new PcgenNames(await readView(rulesetId));
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
    expect(names.findItem("Leather")?.name).toBe("Leather Armor");
    expect(names.findItem("Potion (Cure Light Wounds)")).toBeUndefined();
  });

  test("finds a feat by its choice, or by its name when the ruleset keeps it whole", async () => {
    const names = await seededNames();
    expect(names.findFeat("Weapon Focus", "Sword (Bastard)")?.name).toBe("Weapon Focus: Bastard Sword");
    expect(names.findFeat("Skill Focus", "Diplomacy")?.name).toBe("Skill Focus: Diplomacy");
    expect(names.findFeat("Spell Mastery", "Magic Missile,Shield")?.name).toBe("Spell Mastery");
    // A skill's, as PCGen names it
    expect(names.findFeat("Skill Focus", "Perform ~ Sing")?.name).toBe("Skill Focus: Perform");
  });

  test("finds a skill by its name, the one it opens, or its subtype's base", async () => {
    const names = await seededNames();
    expect(names.findSkill("Knowledge (Nobility)")?.name).toBe("Knowledge (Nobility and Royalty)");
    expect(names.findSkill("Craft (Weaponsmithing)")?.name).toBe("Craft");
    // PCGen 6 names a subtype after a tilde
    expect(names.findSkill("Craft ~ Weaponsmithing")?.name).toBe("Craft");
    expect(names.findSkill("Perform ~ Sing")?.name).toBe("Perform");
    // A name of another script the ruleset hasn't finds nothing, never its first skill
    expect(names.findSkill("Ψυχή")).toBeUndefined();
  });

  test("compares names without accents", async () => {
    expect((await seededNames()).findRace("Half-Élf")?.name).toBe("Half-Elf");
  });

  test("reads a name crafted to make a pattern backtrack in a time its length bounds", async () => {
    const names = await seededNames();
    const name = `a${" (".repeat(40_000)}x`;
    const started = performance.now();
    expect(names.findItem(name)).toBeUndefined();
    expect(names.findRace(name)).toBeUndefined();
    expect(names.findSkill(name)).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("finds a subrace the ruleset hasn't by the race it's a kind of, apart", async () => {
    const names = await seededNames();
    expect(names.findRace("Elf (Drow)")).toBeUndefined();
    expect(names.findBaseRace("Elf (Drow)")?.name).toBe("Elf");
  });

  test("finds a player's race alone: a familiar's isn't a character's", async () => {
    expect((await seededNames()).findRace("Cat")).toBeUndefined();
  });
});
