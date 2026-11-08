import { describe, expect, test } from "bun:test";

import References from "@/codegen/dnd5/tools/references/References.ts";
import { SpeciesSeeds } from "@/codegen/dnd5/tools/seeds/SpeciesSeeds.ts";
import { CORE_BOOK } from "@/vocabulary/dnd5/books.ts";
import { SPECIES_SIZE, SPECIES_SPEED } from "@/vocabulary/dnd5/fields/index.ts";

/** The book's species' seeds. */
function readSpecies() {
  return new SpeciesSeeds(References.load(References.path(CORE_BOOK, "species"), "species"));
}

describe("The SRD 5.2.1's species, as the generator reads them", () => {
  test("give each its size and speed, a species that chooses its size Medium", () => {
    const species = readSpecies().seeds();
    expect(species.map(({ name }) => name)).toHaveLength(9);
    expect(species.find(({ name }) => name === "Human")?.fields).toEqual({
      [SPECIES_SIZE]: "Medium",
      [SPECIES_SPEED]: 30,
    });
    expect(species.find(({ name }) => name === "Goliath")?.fields).toEqual({
      [SPECIES_SIZE]: "Medium",
      [SPECIES_SPEED]: 35,
    });
    expect(species.find(({ name }) => name === "Gnome")?.fields[SPECIES_SIZE]).toBe("Small");
  });

  test("grant a species' traits and Common, and give room in its lineage's pool", () => {
    const elf = readSpecies()
      .seeds()
      .find(({ name }) => name === "Elf")!;
    expect(elf.modifiers?.map(({ operator, target, value }) => `${target} ${operator} ${value}`)).toEqual([
      "feats.darkvision60ft.possessed set true",
      "feats.elvenlineage.possessed set true",
      "feats.feyancestry.possessed set true",
      "feats.keensenses.possessed set true",
      "feats.trance.possessed set true",
      "aptitudes.elflineage.allowed add 1",
      // Every character knows Common, which its species grants
      "languages.common.known set true",
    ]);
  });

  test("make a trait several species print alike one feat, and a lineage a feat of its pool", () => {
    const feats = readSpecies().feats();
    const named = (name: string) => feats.find((feat) => feat.name === name);
    expect(named("Darkvision (60 ft.)")?.aptitudes).toEqual([
      "Dragonborn Traits",
      "Elf Traits",
      "Gnome Traits",
      "Tiefling Traits",
    ]);
    expect(named("Elven Lineage: Wood Elf")).toMatchObject({
      aptitudes: ["Elf Lineage"],
      modifiers: [{ target: "combat.speed.misc", operator: "add", value: "5" }],
    });
    expect(named("Dwarven Toughness")?.modifiers).toEqual([
      { target: "combat.hp.misc", operator: "add", value: "{{ [identity.meta.level] }}", valueType: "number" },
    ]);
    // A trait's choice of skills: a pool of its own, a feat per skill
    expect(named("Keen Senses: Perception")).toMatchObject({
      aptitudes: ["Keen Senses"],
      modifiers: [{ target: "feats.skillproficiencyperception.possessed" }],
    });
  });
});
