import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { eq, or } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";

function anyOf(family: string, options: string[]) {
  return or(...options.map((o) => eq(feat(`${family}: ${o}`))));
}

/** A committed class reference, loaded: what it detects and maps. */
function classOf(book: string, slug: string) {
  return References.load(join(References.dir, book, "classes", `${slug}.json`), "class");
}

function classRequirementsOf(book: string, slug: string) {
  return classOf(book, slug).detected.requirements;
}

describe("A class's detected prerequisites", () => {
  test("are any one of the options a list names, each by its name, though the scraper split the list", () => {
    expect(classRequirementsOf("complete-warrior", "orderOfTheBowInitiate")).toContainEqual(
      anyOf("Weapon Focus", ["Longbow", "Shortbow", "Composite Longbow", "Composite Shortbow"]),
    );
    expect(classRequirementsOf("complete-warrior", "invisibleBlade")).toContainEqual(
      anyOf("Weapon Focus", ["Dagger", "Kukri", "Punching Dagger"]),
    );
    expect(classRequirementsOf("complete-divine", "nightcloak")).toContainEqual(
      anyOf("Spell Focus", ["Enchantment", "Illusion", "Necromancy"]),
    );
  });

  test("read a stray '(or)' as either feat, an alternative as the feat, and a feat's choice as the feat", () => {
    expect(classRequirementsOf("complete-divine", "evangelist")).toContainEqual(
      or(eq(feat("Negotiator")), eq(feat("Persuasive"))),
    );
    expect(classRequirementsOf("complete-warrior", "drunkenMaster")).toContainEqual(
      eq(feat("Improved Unarmed Strike")),
    );
    expect(classRequirementsOf("complete-arcane", "elementalSavant")).toContainEqual(eq(feat("Energy Substitution")));
  });

  test("read an exotic proficiency with a martial weapon as the martial one, and leave out the languages", () => {
    expect(classRequirementsOf("complete-divine", "blackFlameZealot")).toContainEqual(
      or(eq(feat("Martial Weapon Proficiency")), eq(feat("Martial Weapon Proficiency: Kukri"))),
    );
    const malconvoker = classRequirementsOf("complete-scoundrel", "malconvoker");
    expect(malconvoker).toContainEqual(eq(feat("Spell Focus: Conjuration")));
    expect(JSON.stringify(malconvoker)).not.toMatch(/celestial|infernal|languages/);
  });
});

describe("A class's detected bonus feat lists", () => {
  test("are a level's feats only when each entry names one, never a sentence's words", () => {
    expect(classOf("srd", "monk").detected.bonusFeatLists).toContainEqual({
      aptitude: "Monk Bonus Feat (1st)",
      feats: ["Improved Grapple", "Stunning Fist"],
      levels: [1],
    });
    // "can choose one spell known to her that then becomes permanently modified as though affected by one of the
    // following metamagic feats: Enlarge Spell, Extend Spell, Still Spell, or Silent Spell"
    expect(classOf("complete-arcane", "wuJen").detected.bonusFeatLists).toBeUndefined();
    // "may either choose a new terrain in which to receive the benefit (at +1), or increase his effective caster level
    // in a previously chosen terrain by an additional +1"
    expect(classOf("complete-divine", "geomancer").detected.bonusFeatLists).toBeUndefined();
  });
});

describe("A class's detected features", () => {
  test("give the modifiers their text reads and the bonuses it leaves unread, by feature", () => {
    const { featureModifiers } = classOf("srd", "barbarian").detected;
    expect(featureModifiers["Fast Movement"]).toEqual({
      modifiers: [{ target: "combat.speed.misc", operator: "add", value: "10", valueType: "number" }],
    });
    expect(featureModifiers.Rage).toEqual({
      modifiers: [],
      unresolvedModifiers: [expect.stringContaining("+4 bonus to Strength")],
    });
  });

  test("give a proficiency feature the proficiencies its text grants", () => {
    const proficiencies = classOf("srd", "barbarian").detected.featureModifiers["Weapon and Armor Proficiency"];
    expect(proficiencies.modifiers.map(({ target }) => target)).toEqual([
      "feats.simpleweaponproficiency.possessed",
      "feats.martialweaponproficiency.possessed",
      "feats.armorproficiencylight.possessed",
      "feats.armorproficiencymedium.possessed",
      "feats.shieldproficiency.possessed",
    ]);
    // "…plus the hand crossbow, rapier, sap, shortbow, and short sword": the weapon table's Shortsword
    const rogue = classOf("srd", "rogue").detected.featureModifiers["Weapon and Armor Proficiency"];
    expect(rogue.modifiers.map(({ target }) => target)).toContain("feats.martialweaponproficiencyshortsword.possessed");
  });

  test("leave out a pool, whose options are features without modifiers", () => {
    const { featureModifiers } = classOf("srd", "rogue").detected;
    expect(Object.keys(featureModifiers)).toContain("Trap Sense");
    expect(Object.keys(featureModifiers)).not.toContain("Special Ability");
  });

  test("make a pool's options the features its table's rows name after it, wherever they stand", () => {
    // A loremaster's secrets, after her True Lore
    const { features } = classOf("dmg", "loremaster").mapping;
    expect(features["Secret: Dodge Trick"]).toMatchObject({
      aptitude: "Loremaster Secret",
      selectable: true,
      level: 1,
    });
    expect(Object.keys(features).filter((name) => features[name].aptitude === "Loremaster Secret")).toHaveLength(10);
  });

  test("give a pool named for another with a qualifier the other's options, and those its qualifier marks", () => {
    // A horizon walker's terrains, which his Planar Terrain Mastery offers with the planar ones
    const walker = classOf("dmg", "horizonWalker").mapping.features;
    expect(walker["Terrain Mastery: Aquatic"]).toMatchObject({
      aptitude: "Horizon Walker Terrain Mastery",
      sharedAptitudes: ["Horizon Walker Planar Terrain Mastery"],
      level: 1,
    });
    expect(walker["Terrain Mastery: Fiery (Planar)"]).toMatchObject({
      aptitude: "Horizon Walker Planar Terrain Mastery",
      level: 6,
    });
    expect(walker["Terrain Mastery: Fiery (Planar)"].sharedAptitudes).toBeUndefined();
    const offers = (aptitude: string) =>
      Object.values(walker).filter((f) => f.aptitude === aptitude || f.sharedAptitudes?.includes(aptitude)).length;
    expect(offers("Horizon Walker Terrain Mastery")).toBe(8);
    expect(offers("Horizon Walker Planar Terrain Mastery")).toBe(15);
  });

  test("are the modifiers the mapping's features start from, their aptitude picks' added", () => {
    const barbarian = classOf("srd", "barbarian");
    expect(barbarian.mapping.features["Weapon and Armor Proficiency"].modifiers).toEqual(
      barbarian.detected.featureModifiers["Weapon and Armor Proficiency"].modifiers,
    );
    const ranger = classOf("srd", "ranger");
    expect(ranger.detected.featureModifiers["Favored Enemy"].modifiers).toEqual([]);
    expect(ranger.mapping.features["Favored Enemy"].modifiers).toEqual([
      { target: "aptitudes.favoredenemy.allowed", operator: "add", value: "1", valueType: "number" },
    ]);
  });
});
