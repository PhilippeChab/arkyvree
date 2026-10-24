import { describe, expect, test } from "bun:test";

import { poolName } from "@/client/src/pages/characters/details/components/levelUp/poolName.ts";

describe("a pool's name", () => {
  test("adds what it picks to its source's name", () => {
    expect(poolName("General", "Perks")).toBe("General Perks");
    expect(poolName("Ranger Path", "Perks")).toBe("Ranger Path Perks");
  });

  test("never doubles a noun its source's name ends in, plural or singular", () => {
    expect(poolName("Mystic Charms", "Charms")).toBe("Mystic Charms");
    expect(poolName("Soldier Bonus Perk", "Perks")).toBe("Soldier Bonus Perks");
    expect(poolName("Order of the Circle New Charm", "Charms")).toBe("Order of the Circle New Charms");
    // The name's last word alone: a word that only ends in the noun is another word
    expect(poolName("Perkwood", "Perks")).toBe("Perkwood Perks");
  });
});
