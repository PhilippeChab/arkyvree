import { describe, expect, test } from "bun:test";

import { SpellLevels } from "@/codegen/pf1/tools/detect/spells/SpellLevels.ts";

describe("A spell's level line", () => {
  test("reads its level on each Core Rulebook class's list, by the list's aptitude, and leaves later classes out", () => {
    const fireball = new SpellLevels("arcanist 3, bloodrager 3, magus 3, occultist 3, sorcerer 3, wizard 3");
    expect(fireball.levels()).toEqual({ "Sorcerer Spells": 3, "Wizard Spells": 3 });
    expect(fireball.others()).toEqual(["arcanist", "bloodrager", "magus", "occultist"]);
    expect(fireball.unread()).toEqual([]);

    const animate = new SpellLevels("adept 3, cleric 3, sorcerer 4, summoner (unchained) 4, wizard 4");
    expect(animate.levels()).toEqual({
      "Adept Spells": 3,
      "Cleric Spells": 3,
      "Sorcerer Spells": 4,
      "Wizard Spells": 4,
    });
    expect(animate.others()).toEqual(["summoner (unchained)"]);
  });

  test("gives each class a joined name names its level", () => {
    expect(new SpellLevels("sorcerer/wizard 3, bard 2").levels()).toEqual({
      "Bard Spells": 2,
      "Sorcerer Spells": 3,
      "Wizard Spells": 3,
    });
  });

  test("lists what it can't read: a class with no level, a line with no Core Rulebook class", () => {
    expect(new SpellLevels("wizard 2, cleric").unread()).toEqual(['level "cleric"']);
    expect(new SpellLevels("magus 1").unread()).toEqual(['no Core Rulebook class in level "magus 1"']);
  });
});
