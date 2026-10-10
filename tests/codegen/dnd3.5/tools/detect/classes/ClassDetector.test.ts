import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { eq, or } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";

function anyOf(family: string, options: string[]) {
  return or(...options.map((o) => eq(feat(`${family}: ${o}`))));
}

function classRequirementsOf(book: string, slug: string) {
  return References.load(join(References.dir, book, "classes", `${slug}.json`), "class").detected.requirements;
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
