import { describe, expect, test } from "bun:test";

import { BookSeeds } from "@/codegen/pf1/tools/seeds/BookSeeds.ts";
import { RaceSeeds } from "@/codegen/pf1/tools/seeds/RaceSeeds.ts";
import type { RaceReference } from "@/codegen/pf1/tools/types/races.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";
import { RACE_NAMES } from "@/vocabulary/pf1/races.ts";

/** The Core Rulebook's races reference. */
function reference(): RaceReference {
  const ref = new BookSeeds(CORE_BOOK).reference("race");
  if (!ref) throw new Error("The Core Rulebook has no races reference");
  return ref;
}

describe("A race reference's races", () => {
  test("are the Core Rulebook's races, each described by its override", () => {
    const ref = reference();
    const seeds = new RaceSeeds(ref).seeds();
    expect(seeds.map(({ name }) => name).toSorted()).toEqual([...RACE_NAMES].toSorted());
    for (const { name, description } of seeds) expect(description).toBe(ref.overrides?.[name]?.description ?? "");
  });

  test("are described by their size and speed without an override", () => {
    const seeds = new RaceSeeds({ ...reference(), overrides: undefined }).seeds();
    expect(seeds.find(({ name }) => name === "Gnome")?.description).toBe("A small race with a base speed of 20 feet.");
  });

  test("list the traits their reading leaves to the table, by race", () => {
    expect(new RaceSeeds(reference()).unread().Human ?? []).toEqual([]);
    expect(new RaceSeeds(reference()).unread().Halfling).toEqual(["Fearless"]);
  });
});
