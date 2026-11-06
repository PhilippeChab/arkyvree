import { describe, expect, test } from "bun:test";

import { SpellSchool } from "@/codegen/pf1/tools/detect/spells/SpellSchool.ts";

describe("A spell's school line", () => {
  test("reads its school, subschools and descriptors, each the vocabulary's", () => {
    const arrow = new SpellSchool("conjuration (creation) [acid]");
    expect([arrow.school(), arrow.subschools(), arrow.descriptors()]).toEqual(["Conjuration", ["Creation"], ["Acid"]]);

    const command = new SpellSchool("enchantment (compulsion) [language-dependent, mind-affecting]");
    expect(command.descriptors()).toEqual(["Language-Dependent", "Mind-Affecting"]);
    expect(new SpellSchool("transmutation").subschools()).toEqual([]);
  });

  test("takes each value a combination joins, and a descriptor that's a subschool as one", () => {
    expect(new SpellSchool("evocation [fire or cold]").descriptors()).toEqual(["Fire", "Cold"]);
    expect(new SpellSchool("conjuration (creation or calling)").subschools()).toEqual(["Creation", "Calling"]);
    expect(new SpellSchool("illusion (figment, glamer)").subschools()).toEqual(["Figment", "Glamer"]);

    const shadow = new SpellSchool("illusion (shadow) [shadow]");
    expect([shadow.subschools(), shadow.descriptors(), shadow.unread()]).toEqual([["Shadow"], [], []]);
  });

  test("leaves out later books' descriptors and pointers to its text, and lists what it can't read", () => {
    const curse = new SpellSchool("enchantment (compulsion) [curse, language-dependent, mind-affecting]");
    expect(curse.descriptors()).toEqual(["Language-Dependent", "Mind-Affecting"]);
    expect(curse.leftOut()).toEqual(["curse"]);
    expect(curse.unread()).toEqual([]);
    expect(new SpellSchool("conjuration (calling) [see text for lesser planar ally]").leftOut()).toEqual([
      "see text for lesser planar ally",
    ]);

    const odd = new SpellSchool("chronomancy (temporal) [time]");
    expect(odd.school()).toBeUndefined();
    expect(odd.unread()).toEqual([
      'school "chronomancy (temporal) [time]"',
      'subschool "temporal"',
      'descriptor "Time"',
    ]);
  });
});
