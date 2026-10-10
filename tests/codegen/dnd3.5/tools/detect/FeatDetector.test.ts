import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { FeatDetector } from "@/codegen/dnd3.5/tools/detect/FeatDetector.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";
import type { FeatReference } from "@/codegen/dnd3.5/tools/types/feats.ts";
import { eq, eqStr, gte, or } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";

function featDetectedOf(name: string, prerequisiteText: string) {
  return featsDetected([{ name, featType: "general", prerequisiteText, benefit: "", special: "" }])[name];
}

/** A general feat's page, with no prerequisite. */
function featEntry(name: string, benefit: string, special = "") {
  return { name, featType: "general", prerequisiteText: "", benefit, special };
}

/** What a feat reference's detector detects in `raw`, in a book with no classes. */
function featsDetected(raw: FeatReference["raw"]) {
  return new FeatDetector({ _meta: { book: "srd", scrapedAt: "", sourceUrl: "", type: "feat" }, raw }, []).resolve()
    .detected;
}

describe("A feat's detected aptitudes", () => {
  test("make a general feat a fighter bonus feat when its Special says a fighter may or can select it", () => {
    const detected = featsDetected([
      featEntry("Mounted Combat", "", "A fighter may select Mounted Combat as one of his fighter bonus feats."),
      featEntry("Deadly Defense", "", "A fighter can select Deadly Defense as one of his fighter bonus feats (PH 38)."),
      featEntry("Shield Proficiency", "", "Fighters automatically have Shield Proficiency as a bonus feat."),
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
      eq("feats.summonfamiliar.*.possessed"),
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

  test("read an alignment, a class feature named as one and a proficiency, and report a class feature none reads", () => {
    const holyStrike = featDetectedOf("Holy Strike", "any good alignment, Smite evil class feature,");
    expect(holyStrike.requirements).toEqual([
      or(...["Lawful Good", "Neutral Good", "Chaotic Good"].map((a) => eqStr("identity.beliefs.alignment", a))),
      eq("feats.smiteevil.*.possessed"),
    ]);
    expect(holyStrike.unresolvedPrereqs).toBeUndefined();
    const healer = featDetectedOf("Spontaneous Healer", "Knowledge (religion) 4 ranks, nonevil alignment,");
    expect(healer.requirements).toEqual([
      gte("skills.knowledgereligion.rank", 4),
      or(
        ...["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral"].map(
          (a) => eqStr("identity.beliefs.alignment", a),
        ),
      ),
    ]);
    const stalker = featDetectedOf("Martial Stalker", "ki power, Proficiency with all martial weapons,");
    expect(stalker.requirements).toEqual([eq("feats.kipower.*.possessed"), eq(feat("Martial Weapon Proficiency"))]);
    expect(stalker.unresolvedPrereqs).toBeUndefined();
    const whip = featDetectedOf("Whip Climber", "Use Rope 5 ranks, proficiency with the whip,");
    expect(whip.requirements).toEqual([gte("skills.userope.rank", 5), eq(feat("Exotic Weapon Proficiency: Whip"))]);
    const shield = featDetectedOf("Phalanx Fighting", "base attack bonus +1, Proficiency with a heavy shield,");
    expect(shield.requirements).toEqual([gte("combat.bab", 1), eq(feat("Shield Proficiency"))]);
    expect(shield.unresolvedPrereqs).toBeUndefined();
    const turning = featDetectedOf("Divine Might", "Turn or rebuke undead class feature,");
    expect(turning.requirements).toEqual([eq("feats.turnorrebukeundead.*.possessed")]);
    expect(turning.unresolvedPrereqs).toBeUndefined();
    const secret = featDetectedOf("Extra Spell Secret", "Spell secret class ability,");
    expect(secret.requirements).toEqual([]);
    expect(secret.unresolvedPrereqs).toEqual(["Spell secret class ability"]);
  });

  test("read a class feature named in lower case or alone as any class's, the wild shape a bare name gives too", () => {
    expect(featDetectedOf("Devoted Tracker", "Track, smite evil, wild empathy,").requirements).toEqual([
      eq(feat("Track")),
      eq("feats.smiteevil.*.possessed"),
      eq("feats.wildempathy.*.possessed"),
    ]);
    expect(featDetectedOf("Scent", "Wild shape,").requirements).toEqual([eq("feats.wildshape.*.possessed")]);
    expect(featDetectedOf("Subsonics", "Perform 10 ranks, bardic music,").requirements).toEqual([
      gte("skills.perform.rank", 10),
      eq("feats.bardicmusic.*.possessed"),
    ]);
    expect(featDetectedOf("Ascetic Stalker", "Ki power, ki strike (magic),").requirements).toEqual([
      eq(feat("Ki Power")),
      gte("classes.monk.level", 4),
    ]);
  });
});

describe("A feat's detected template", () => {
  test("is one feat per skill or school for a feat taken again for each, not one naming skills or schools", () => {
    const detected = featsDetected([
      featEntry(
        "Skill Focus",
        "You get a +3 bonus on all checks involving that skill.",
        "Each time you take the feat, it applies to a new skill.",
      ),
      featEntry("Jack of All Trades", "You can use any skill as if you had 1/2 rank in that skill."),
      featEntry(
        "Spell Focus",
        "Add +1 to the Difficulty Class for all saving throws against spells from the school of magic you select.",
      ),
      featEntry("Precocious Apprentice", "Choose one 2nd-level spell from a school of magic you have access to."),
      featEntry(
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

  test("is one feat per weapon for a feat taken again for each, not one naming a type of weapon", () => {
    const detected = featsDetected([
      featEntry(
        "Weapon Focus",
        "You gain a +1 bonus on all attack rolls you make using the selected weapon.",
        "You can gain this feat multiple times. Its effects do not stack. Each time you take the feat, it applies to a new type of weapon.",
      ),
      featEntry(
        "Power Critical",
        "When using the weapon you selected, you gain a +4 bonus on the roll to confirm a threat.",
      ),
      featEntry(
        "Greater Resiliency",
        "Your damage reduction increases by 1.",
        "This feat has no effect on the type of weapon or damage that overcomes your damage reduction.",
      ),
    ]);
    expect(Object.fromEntries(Object.entries(detected).map(([name, d]) => [name, d.template?.type ?? null]))).toEqual({
      "Weapon Focus": "weapon",
      "Power Critical": "weapon",
      "Greater Resiliency": null,
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

  test("takes the bonus feat lists naming it by its letters, without the mark a book puts on its new feats", () => {
    // The scout's list: "…Hear the Unseen?, …? New feat described in Chapter 3"
    const { mapping } = References.load(join(References.dir, "complete-adventurer", "feats.json"), "feat");
    expect(mapping["Hear The Unseen"].aptitudes).toEqual(["General", "Scout Bonus Feat"]);
    expect(mapping["Improved Swimming"].aptitudes).toEqual(["General", "Exemplar Bonus Feat", "Scout Bonus Feat"]);
  });
});
