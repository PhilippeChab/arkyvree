import { describe, expect, test } from "bun:test";

import { poolName } from "@/client/src/pages/characters/details/components/dnd3.5/poolName.ts";

describe("a pool's name", () => {
  test("adds what it picks to its aptitude's name", () => {
    expect(poolName("General", "Feats")).toBe("General Feats");
    expect(poolName("Cleric Domain", "Feats")).toBe("Cleric Domain Feats");
  });

  test("never doubles a noun its aptitude's name ends in, plural or singular", () => {
    expect(poolName("Wizard Spells", "Spells")).toBe("Wizard Spells");
    expect(poolName("Fighter Bonus Feat", "Feats")).toBe("Fighter Bonus Feats");
    expect(poolName("Mage of the Arcane Order New Spell", "Spells")).toBe("Mage of the Arcane Order New Spells");
    // The name's last word alone: a word that only ends in the noun is another word
    expect(poolName("Featherweight", "Feats")).toBe("Featherweight Feats");
  });
});
