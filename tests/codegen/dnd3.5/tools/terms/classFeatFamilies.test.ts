import { describe, expect, test } from "bun:test";

import { findClassFeatFamilies } from "@/codegen/dnd3.5/tools/terms/classFeatFamilies.ts";

describe("A class feature's families", () => {
  test("are its feature's, and Smite for any smite, smite evil's too", () => {
    expect(findClassFeatFamilies("Rage (Barbarian)")).toEqual(["Rage"]);
    expect(findClassFeatFamilies("Smite Evil (Paladin)")).toEqual(["Smite", "Smite Evil"]);
    expect(findClassFeatFamilies("Smite Undead (Hunter of the Dead)")).toEqual(["Smite"]);
    expect(findClassFeatFamilies("Kiai Smite (Samurai)")).toEqual(["Smite"]);
    expect(findClassFeatFamilies("Smite (Pious Templar)")).toEqual(["Smite"]);
    expect(findClassFeatFamilies("Grace of the Dark")).toEqual([]);
  });
});
