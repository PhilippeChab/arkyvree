import { describe, expect, test } from "bun:test";

import { FeatDetector } from "@/codegen/dnd3.5/tools/detect/FeatDetector.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";
import type { FeatReference } from "@/codegen/dnd3.5/tools/types/feats.ts";
import { eq, eqStr, feat, gte, or } from "@/content/dnd3.5/builders/customization/requirements.ts";

function featDetectedOf(name: string, prerequisiteText: string) {
  return featsDetected([{ name, featType: "general", prerequisiteText, benefit: "", special: "" }])[name];
}

/** What a feat reference's detector detects in `raw`, in a book with no classes. */
function featsDetected(raw: FeatReference["raw"]) {
  return new FeatDetector({ _meta: { book: "srd", scrapedAt: "", sourceUrl: "", type: "feat" }, raw }, []).resolve()
    .detected;
}

describe("A feat's detected aptitudes", () => {
  test("make a general feat a fighter bonus feat when its Special says a fighter may or can select it", () => {
    const feat = (name: string, special: string) => ({
      name,
      featType: "general",
      prerequisiteText: "",
      benefit: "",
      special,
    });
    const detected = featsDetected([
      feat("Mounted Combat", "A fighter may select Mounted Combat as one of his fighter bonus feats."),
      feat("Deadly Defense", "A fighter can select Deadly Defense as one of his fighter bonus feats (PH 38)."),
      feat("Shield Proficiency", "Fighters automatically have Shield Proficiency as a bonus feat."),
    ]);
    expect(Object.fromEntries(Object.entries(detected).map(([name, d]) => [name, d.aptitudes]))).toEqual({
      "Mounted Combat": ["General", "Fighter Bonus Feat"],
      "Deadly Defense": ["General", "Fighter Bonus Feat"],
      "Shield Proficiency": ["General"],
    });
  });
});

describe("A feat's detected prerequisites", () => {
  test("name a class feature by its family, and a lawful ki strike by the monk level it comes at", () => {
    expect(featDetectedOf("Improved Familiar", "Ability to acquire a new familiar,").requirements).toEqual([
      eq(feat("Summon Familiar")),
    ]);
    expect(featDetectedOf("Axiomatic Strike", "Stunning Fist, Ki strike (lawful),").requirements).toEqual([
      eq(feat("Stunning Fist")),
      gte("classes.monk.level", 10),
    ]);
  });

  test("read a relevant alignment as the feat's own, and a feat's choice as the feat", () => {
    expect(featDetectedOf("Spell Focus (Chaos)", "Relevant alignment,").requirements).toEqual([
      or(...["Chaotic Good", "Chaotic Neutral", "Chaotic Evil"].map((a) => eqStr("identity.beliefs.alignment", a))),
    ]);
    expect(featDetectedOf("Lord of the Uttercold", "Energy Substitution (cold),").requirements).toEqual([
      eq(feat("Energy Substitution")),
    ]);
  });

  test("report what no path reads, flight, instead of reading it as feats", () => {
    const flight = featDetectedOf(
      "Improved Flight",
      "Ability to fly (naturally, magically, or through shapechanging),",
    );
    expect(flight.requirements).toEqual([]);
    expect(flight.unresolvedPrereqs).toEqual(["Ability to fly"]);
  });
});

describe("A feat's detected template", () => {
  test("is one feat per skill or school for a feat taken again for each, not one naming skills or schools", () => {
    const feat = (name: string, benefit: string, special = "") => ({
      name,
      featType: "general",
      prerequisiteText: "",
      benefit,
      special,
    });
    const detected = featsDetected([
      feat(
        "Skill Focus",
        "You get a +3 bonus on all checks involving that skill.",
        "Each time you take the feat, it applies to a new skill.",
      ),
      feat("Jack of All Trades", "You can use any skill as if you had 1/2 rank in that skill."),
      feat(
        "Spell Focus",
        "Add +1 to the Difficulty Class for all saving throws against spells from the school of magic you select.",
      ),
      feat("Precocious Apprentice", "Choose one 2nd-level spell from a school of magic you have access to."),
      feat(
        "Magical Appraisal",
        "When you succeed on a Spellcraft check to determine the school of magic of the aura surrounding a magic item…",
      ),
    ]);
    expect(Object.fromEntries(Object.entries(detected).map(([name, d]) => [name, d.template?.type ?? null]))).toEqual({
      "Skill Focus": "skill",
      "Jack of All Trades": null,
      "Spell Focus": "school",
      "Precocious Apprentice": null,
      "Magical Appraisal": null,
    });
  });
});

describe("A feat's mapping", () => {
  test("takes the class levels of a bonus feat list naming it as alternatives, the class by its name's path segment", () => {
    const wuJen = References.loadClasses("complete-arcane").find(({ file }) => file === "wuJen.json");
    if (!wuJen) throw new Error("Wu Jen isn't a class of Complete Arcane's");
    const ref = structuredClone(wuJen.ref);
    ref.mapping.bonusFeatLists = [{ aptitude: "Wu Jen Bonus Feat", feats: ["Dodge"], levels: [5, 10] }];
    const dodge = { name: "Dodge", featType: "general", prerequisiteText: "Dex 13.", benefit: "", special: "" };
    const { detected, mapping } = new FeatDetector(
      { _meta: { book: "complete-arcane", scrapedAt: "", sourceUrl: "", type: "feat" }, raw: [dodge] },
      [{ file: wuJen.file, ref }],
    ).resolve();
    expect(detected.Dodge.requirements).toHaveLength(1);
    expect(mapping.Dodge.requirements).toEqual([or(detected.Dodge.requirements[0], gte("classes.wujen.level", 5))]);
    expect(mapping.Dodge.aptitudes).toContain("Wu Jen Bonus Feat");
  });
});
