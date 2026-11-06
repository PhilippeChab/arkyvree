import { describe, expect, test } from "bun:test";

import { readExpertisePicks, readMasteryKinds } from "@/codegen/dnd5.2/tools/detect/classFeatures.ts";

describe("The skills a feature gives Expertise in", () => {
  test("are those its text counts, however it words them", () => {
    expect(readExpertisePicks("You gain Expertise in two of your skill proficiencies of your choice.")).toBe(2);
    expect(readExpertisePicks('You gain Expertise (see "Rules Glossary") in two of your skill proficiencies.')).toBe(2);
    expect(readExpertisePicks("Choose one of your skill proficiencies with which you lack Expertise.")).toBe(1);
  });

  test("are none for a feature that names its skills, or gives none", () => {
    expect(readExpertisePicks("Choose one of the following skills in which you have proficiency: Arcana.")).toBe(
      undefined,
    );
    expect(readExpertisePicks("You can attack twice instead of once.")).toBeUndefined();
  });
});

describe("The kinds of weapons a Weapon Mastery takes", () => {
  test("are those its text counts", () => {
    expect(readMasteryKinds("you to use the mastery properties of three kinds of Simple or Martial weapons")).toBe(3);
  });

  test("are none for a text that counts none", () => {
    expect(readMasteryKinds("You can use the mastery properties of your weapons.")).toBeUndefined();
  });
});
