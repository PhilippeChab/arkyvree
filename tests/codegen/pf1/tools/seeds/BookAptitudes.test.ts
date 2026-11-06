import { describe, expect, test } from "bun:test";

import { BookAptitudes, type BookContents } from "@/codegen/pf1/tools/seeds/BookAptitudes.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { ClassSeed } from "@/content/pf1/builders/classes/types.ts";

/** A class of `seed`'s parts over a bare one's. */
function classOf(seed: Partial<ClassSeed>): ClassSeed {
  return {
    name: "Fighter",
    description: "",
    fields: {},
    levels: 20,
    skillPoints: 2,
    bab: "good",
    saves: { fortitude: "good", reflex: "poor", will: "poor" },
    classSkills: [],
    ...seed,
  };
}

/** A book's contents, none but `contents`. */
function contentsOf(contents: Partial<BookContents>): BookContents {
  return { classes: [], domains: [], feats: [], items: [], races: [], spells: [], ...contents };
}

describe("A book's aptitudes", () => {
  test("are General and every aptitude its seeds name, sorted, each once", () => {
    const contents = contentsOf({
      feats: [{ name: "Power Attack", description: "", aptitudes: ["General", "Fighter Bonus Feat"] }],
      spells: [
        {
          name: "Fly",
          description: "",
          aptitudes: ["Sorcerer Spells", "Wizard Spells"],
          aptitudeLevels: { "Sorcerer Spells": 3, "Wizard Spells": 3 },
          fields: {},
          level: 3,
        },
      ],
      classes: [
        classOf({ classFeatureAptitude: "Fighter Class Feature", freeFeats: [[1, "Bravery", "Fighter Bravery"]] }),
        classOf({ name: "Cleric", spells: { slug: "clericspells", perDay: [] } }),
      ],
    });
    expect(new BookAptitudes(contents).names()).toEqual([
      "Cleric Spells",
      "Fighter Bonus Feat",
      "Fighter Bravery",
      "Fighter Class Feature",
      "General",
      "Sorcerer Spells",
      "Wizard Spells",
    ]);
  });

  test("are a cleric's domain pick and domain spells with domains", () => {
    const contents = contentsOf({ domains: [{ name: "Air", description: "", spells: [] }] });
    expect(new BookAptitudes(contents).names()).toEqual(["Cleric Domain", "Domain Spells", "General"]);
  });

  test("refuse a book whose seeds target an aptitude by a slug of none", () => {
    const targeting = (target: string) =>
      contentsOf({ races: [{ name: "Human", description: "", fields: {}, modifiers: [bonus(target, 1)] }] });
    expect(new BookAptitudes(targeting("aptitudes.general.allowed")).names()).toEqual(["General"]);
    // A bonded creature's aptitude is its bond's, seeded with it, no book's
    expect(new BookAptitudes(targeting("aptitudes.familiarbond.allowed")).names()).toEqual(["General"]);
    expect(() => new BookAptitudes(targeting("aptitudes.fighterbonusfeat.allowed")).names()).toThrow(
      'aptitudes.fighterbonusfeat.allowed: no aptitude of the book is "fighterbonusfeat"',
    );
  });
});
