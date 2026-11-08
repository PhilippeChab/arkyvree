import { describe, expect, test } from "bun:test";

import { BookAptitudes, type BookContents } from "@/codegen/dnd5.2/tools/seeds/BookAptitudes.ts";
import { bonus, setFlag } from "@/content/core/builders/customization/modifiers.ts";
import type { ClassSeed } from "@/content/dnd5.2/builders/classes/types.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";

/** A class of `seed`'s parts over a bare one's. */
function classOf(seed: Partial<ClassSeed>): ClassSeed {
  return {
    name: "Fighter",
    description: "",
    fields: {},
    classSkills: [],
    featurePool: "Fighter Features",
    features: [],
    ...seed,
  };
}

/** A book's contents, none but `contents`. */
function contentsOf(contents: Partial<BookContents>): BookContents {
  return { backgrounds: [], classes: [], feats: [], items: [], species: [], spells: [], ...contents };
}

/** A feat of `name` in `aptitudes`, of `seed`'s parts. */
function featOf(name: string, aptitudes: string[], seed: Partial<FeatSeed> = {}): FeatSeed {
  return { name, description: "", aptitudes, ...seed };
}

describe("A book's aptitudes", () => {
  test("are the feat categories' pools, the engine's skill pools and every pool its seeds name, sorted, each once", () => {
    const contents = contentsOf({
      feats: [
        featOf("Defense", ["Fighting Style", "Ability Score Improvement"]),
        featOf("Rage (Barbarian)", ["Barbarian Features"]),
      ],
      spells: [{ name: "Fireball", description: "", aptitudes: ["Wizard Spells"], fields: {}, level: 3 }],
      // A class's skills' pool when it picks among some skills; none for a bard's, any skill's
      classes: [
        classOf({
          name: "Wizard",
          classSkills: ["Arcana", "History"],
          featurePool: "Wizard Features",
          spells: { list: "Wizard Spells", known: [] },
        }),
        classOf({ name: "Bard", featurePool: "Bard Features" }),
      ],
    });
    expect(new BookAptitudes(contents).names()).toEqual([
      "Ability Score Improvement",
      "Barbarian Features",
      "Bard Features",
      "Epic Boon",
      "Expertise",
      "Fighting Style",
      "Origin",
      "Skill Proficiencies",
      "Wizard Features",
      "Wizard Skills",
      "Wizard Spells",
    ]);
  });
});

describe("A book's check", () => {
  test("takes targets that name its pools, its feats and the engine's skill feats", () => {
    const contents = contentsOf({
      feats: [
        featOf("Alert", ["Origin"]),
        featOf("Skilled", ["Origin"], {
          modifiers: [bonus("aptitudes.skillproficiencies.allowed", 3), setFlag("feats.alert.possessed")],
        }),
        featOf("Expert", ["Ability Score Improvement"], { modifiers: [setFlag("feats.expertisestealth.possessed")] }),
      ],
    });
    expect(() => new BookAptitudes(contents).check()).not.toThrow();
  });

  test("refuses a modifier naming a pool the book has none of", () => {
    const contents = contentsOf({
      feats: [featOf("Lost", ["Origin"], { modifiers: [bonus("aptitudes.nowhere.allowed", 1)] })],
    });
    expect(() => new BookAptitudes(contents).check()).toThrow(
      'aptitudes.nowhere.allowed: no aptitude of the book is "nowhere"',
    );
  });

  test("refuses a grant or a requirement naming a feat the book has none of", () => {
    const granted = contentsOf({
      species: [{ name: "Elf", description: "", fields: {}, modifiers: [setFlag("feats.missingtrait.possessed")] }],
    });
    expect(() => new BookAptitudes(granted).check()).toThrow(
      'feats.missingtrait.possessed: no feat of the book is "missingtrait"',
    );
    const required = contentsOf({
      feats: [
        featOf("Follower", ["Ability Score Improvement"], {
          requirements: [{ target: "feats.leader.possessed", operator: "equal", value: "true", valueType: "boolean" }],
        }),
      ],
    });
    expect(() => new BookAptitudes(required).check()).toThrow('no feat of the book is "leader"');
  });

  test("refuses two feats of one name, and a class linking or granting a feat the book has none of", () => {
    const twice = contentsOf({ feats: [featOf("Alert", ["Origin"]), featOf("Alert", ["Ability Score Improvement"])] });
    expect(() => new BookAptitudes(twice).check()).toThrow("Two feats are named Alert");
    const linked = contentsOf({
      classes: [
        classOf({ links: { startingProficiencies: "Fighter Starting Proficiencies" }, features: [[1, "Second Wind"]] }),
      ],
    });
    expect(() => new BookAptitudes(linked).check()).toThrow(
      "Fighter names feats the book has none of: Fighter Starting Proficiencies, Second Wind",
    );
  });
});
