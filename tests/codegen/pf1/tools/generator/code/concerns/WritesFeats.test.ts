import { describe, expect, test } from "bun:test";

import { CodeFile } from "@/codegen/pf1/tools/generator/code/CodeFile.ts";
import type { FeatFamily } from "@/codegen/pf1/tools/seeds/FeatSeeds.ts";
import { FAMILY_OPTIONS, OPTION } from "@/codegen/pf1/tools/terms/featOptions.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { eq, gte } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/pf1/builders/feats/possession.ts";
import { FEAT_FAMILY } from "@/vocabulary/pf1/fields/index.ts";

/** Skill Focus, its option named in its description and its modifiers' paths. */
const SKILL_FOCUS: FeatFamily = {
  name: "Skill Focus",
  family: "Skill Focus",
  options: FAMILY_OPTIONS["Skill Focus"],
  description: `You get a +3 bonus on all checks involving ${OPTION}.`,
  aptitudes: ["General"],
  requirements: [],
  modifiers: [
    bonus(`skills.${OPTION}.misc`, 3),
    { ...bonus(`skills.${OPTION}.misc`, 3), requirements: [gte(`skills.${OPTION}.rank`, 10)] },
  ],
  fields: {},
  featNames: {},
  notes: [],
  proficient: false,
};

/** Weapon Specialization, as the Core Rulebook's page gives it. */
const WEAPON_SPECIALIZATION: FeatFamily = {
  name: "Weapon Specialization",
  family: "Weapon Specialization",
  options: FAMILY_OPTIONS["Weapon Specialization"],
  description: "You gain a +2 bonus on all damage rolls you make using the selected weapon.",
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [eq(feat("Weapon Focus")), gte("classes.fighter.level", 4)],
  modifiers: [bonus(`items.weapons.${OPTION}.damage.misc`, 2)],
  fields: { [FEAT_FAMILY]: ["Combat"] },
  featNames: { weaponfocus: "Weapon Focus" },
  notes: [],
  proficient: true,
};

describe("A family of feats written as code", () => {
  test("makes a feat per weapon, proficient with it, its family's feat for the same weapon required", () => {
    const file = new CodeFile();
    expect(file.featFamily(WEAPON_SPECIALIZATION, ["General", "Fighter Bonus Feat", "Monk Bonus Feat"])).toBe(
      "WEAPON_SPECIALIZATION_FEATS",
    );
    const code = file.code();
    expect(code).toContain("export const WEAPON_SPECIALIZATION_FEATS: FeatSeed[] = ALL_WEAPONS.map((w) => ({");
    expect(code).toContain('aptitudes: ["General", "Fighter Bonus Feat", "Monk Bonus Feat"],');
    expect(code).toContain("...proficiencyRequirements(w),");
    expect(code).toContain("eq(feat(`Weapon Focus: ${w}`)),");
    expect(code).toContain('gte("classes.fighter.level", 4),');
    expect(code).toContain("target: `items.weapons.${stripSeparators(w)}.damage.misc`");
    expect(code).toContain('fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Weapon Specialization", "Combat"] },');
  });

  test("names its option in its description, and in its modifiers' paths and requirements", () => {
    const file = new CodeFile();
    file.featFamily(SKILL_FOCUS, ["General"]);
    const code = file.code();
    expect(code).toContain("description: `You get a +3 bonus on all checks involving ${s}.`,");
    expect(code).toContain("requirements: [gte(`skills.${stripSeparators(s)}.rank`, 10)]");
  });
});

describe("A feats file", () => {
  test("lists its feats by type, and a family a feat leads as its feats per option", () => {
    const file = new CodeFile();
    const lists = file.featsFile(
      [
        {
          name: "Dodge",
          description: "",
          aptitudes: ["General", "Fighter Bonus Feat"],
          fields: { [FEAT_FAMILY]: ["Combat"] },
        },
        { name: "Toughness", description: "", aptitudes: ["General"] },
        { name: "Skill Focus", description: "", aptitudes: ["General"] },
      ],
      (name) => (name === "Skill Focus" ? SKILL_FOCUS : undefined),
    );
    expect(lists).toEqual(["COMBAT_FEATS", "GENERAL_FEATS", "SKILL_FOCUS_FEATS"]);
  });
});
