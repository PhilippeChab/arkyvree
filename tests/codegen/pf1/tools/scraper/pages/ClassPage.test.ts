import { describe, expect, test } from "bun:test";

import { ClassPage } from "@/codegen/pf1/tools/scraper/pages/ClassPage.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

/** A class's page holding `intro` under its title, in the site's frame. */
function classPageOf(intro: string, prestige = false): ClassPage {
  const html = `<html><body><div id="main"><h1 class="title">Seeker</h1><b>Source</b> <i>Book pg. 1</i><br />${intro}</div></body></html>`;
  return new ClassPage(html, "Seeker", prestige);
}

describe("A class's page", () => {
  test("reads a base class's rules: its details, skills, progression and features, its other books' sections left out", () => {
    const fighter = new ClassPage(fixture("class-fighter"), "Fighter").read()!;
    expect(fighter).toMatchObject({
      name: "Fighter",
      prestige: false,
      sources: [{ book: "PRPG Core Rulebook", page: 55 }],
    });
    expect(fighter.details).toEqual([
      { label: "Alignment", text: "Any." },
      { label: "Hit Die", text: "d10." },
      { label: "Starting Wealth", text: "5d6 x 10 gp (average 175 gp)." },
      { label: "Skill Points at each Level", text: "2 + Int modifier." },
    ]);
    expect(fighter.requirements).toEqual([]);
    expect(fighter.classSkills).toStartWith("The Fighter's class skills are Climb (Str), Craft (Int), Handle Animal");
    expect(fighter.tables).toHaveLength(1);
    expect(fighter.tables[0].columns).toEqual([
      "Level",
      "Base Attack Bonus",
      "Fort Save",
      "Ref Save",
      "Will Save",
      "Special",
    ]);
    expect(fighter.tables[0].rows[1]).toEqual(["2nd", "+2", "+3", "+0", "+0", "Bonus feat, bravery +1"]);
    expect(fighter.tables[0].rows).toHaveLength(20);
    expect(fighter.features.map(({ label }) => label)).toEqual([
      "Weapon and Armor Proficiency",
      "Bonus Feats",
      "Bravery (Ex)",
      "Armor Training (Ex)",
      "Weapon Training (Ex)",
      "Armor Mastery (Ex)",
      "Weapon Mastery (Ex)",
    ]);
    expect(fighter.exClass).toBeUndefined();
  });

  test("leaves out its description and its role, which aren't open game content", () => {
    const seeker = classPageOf(
      "Seekers look for lost things.<br /><br /><b>Role</b>: They lead.<br /><b>Hit Die</b>: d8.",
    );
    expect(seeker.read()!.details).toEqual([{ label: "Hit Die", text: "d8." }]);
    expect(JSON.stringify(seeker.read())).not.toContain("lost things");
  });

  test("leaves out a prestige class's alignment, which tells who takes it, and keeps a base class's", () => {
    const intro = "<b>Alignment</b>: Seekers are often neutral.<br /><b>Hit Die</b>: d8.";
    expect(classPageOf(intro, true).read()!.details).toEqual([{ label: "Hit Die", text: "d8." }]);
    expect(
      classPageOf(intro)
        .read()!
        .details.map(({ label }) => label),
    ).toEqual(["Alignment", "Hit Die"]);
  });

  test("reads a feature's paragraphs as one text, a space between them", () => {
    const bonusFeats = new ClassPage(fixture("class-fighter"), "Fighter").read()!.features[1];
    expect(bonusFeats.text).toContain("“fighter bonus feats.” Upon reaching 4th level");
  });

  test("reads a caster's spells per day after their group's name, and its spells known's table", () => {
    const [progression, known] = new ClassPage(fixture("class-sorcerer"), "Sorcerer").read()!.tables;
    expect(progression.columns.slice(5, 8)).toEqual(["Special", "Spells Per Day 1st", "Spells Per Day 2nd"]);
    expect(progression.rows[0].slice(5, 7)).toEqual(["Bloodline power, cantrips, eschew materials", "3"]);
    expect(known.columns).toEqual(["Level", "0", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"]);
    expect(known.rows[0]).toEqual(["1st", "4", "2", "-", "-", "-", "-", "-", "-", "-", "-"]);
  });

  test("reads what befalls a member who breaks its code", () => {
    const cleric = new ClassPage(fixture("class-cleric"), "Cleric").read()!;
    expect(cleric.exClass).toStartWith("A cleric who grossly violates the code of conduct required by her god");
    expect(cleric.features.map(({ label }) => label)).toContain("Channel Energy (Su)");
  });

  test("reads a prestige class's requirements, and its hit die among its skills' details", () => {
    const archer = new ClassPage(fixture("class-arcane-archer"), "Arcane Archer", true).read()!;
    expect(archer.prestige).toBe(true);
    expect(archer.requirements).toEqual([
      { label: "Base Attack Bonus", text: "+6." },
      { label: "Feats", text: "Point-Blank Shot, Precise Shot, Weapon Focus (longbow or shortbow)." },
      { label: "Spells", text: "Ability to cast 1st-level arcane spells." },
    ]);
    expect(archer.details.map(({ label }) => label)).toEqual(["Skill Points at each Level", "Hit Die"]);
    expect(archer.tables[0].columns.at(-1)).toBe("Spells Per Day");
  });

  test("takes its title for its name when read alone, and reads no class off a page without an entry", () => {
    expect(new ClassPage(fixture("class-fighter")).read()!.name).toBe("Fighter");
    expect(new ClassPage("<html><body><div id='main'><p>Not found</p></div></body></html>").read()).toBeUndefined();
  });
});
