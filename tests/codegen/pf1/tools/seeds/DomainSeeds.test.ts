import { describe, expect, test } from "bun:test";

import { BookSeeds } from "@/codegen/pf1/tools/seeds/BookSeeds.ts";
import { DomainSeeds } from "@/codegen/pf1/tools/seeds/DomainSeeds.ts";
import type { DomainReference } from "@/codegen/pf1/tools/types/domains.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";

/** A reference of one domain, `spells` its Domain Spells line, or a subdomain. */
function oneDomain(spells: string, subdomain = false): DomainReference {
  const raw = [
    {
      name: "Test",
      sources: [],
      subdomain,
      details: [
        { label: "Granted Powers", text: "You test." },
        { label: "Domain Spells", text: spells },
      ],
    },
  ];
  return { ...reference(), overrides: undefined, raw };
}

/** The Core Rulebook's domains reference. */
function reference(): DomainReference {
  const ref = new BookSeeds(CORE_BOOK).reference("domain");
  if (!ref) throw new Error("The Core Rulebook has no domains reference");
  return ref;
}

describe("A domains reference's domains", () => {
  test("are its domains, each described by its granted powers, with a spell at each level from 1st to 9th", () => {
    const seeds = new BookSeeds(CORE_BOOK).domains(reference()).seeds();
    expect(seeds).toHaveLength(33);
    for (const { spells } of seeds) expect(spells.map(({ level }) => level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const air = seeds.find(({ name }) => name === "Air");
    expect(air?.description.startsWith("You can manipulate lightning, mist, and wind")).toBe(true);
    expect(air?.description).toContain("Lightning Arc (Sp): ");
  });

  test("name each spell as the book's spells do, whatever its degree's place or its numeral", () => {
    const names = ["Cure Critical Wounds, Mass", "Summon Monster IX", "Fly"];
    const seeds = new DomainSeeds(
      oneDomain("1st—fly, 8th—mass cure critical wounds, 9th—summon monster 9 (chaos only)."),
      names,
    ).seeds();
    expect(seeds[0].spells).toEqual([
      { name: "Fly", level: 1 },
      { name: "Cure Critical Wounds, Mass", level: 8 },
      { name: "Summon Monster IX", level: 9 },
    ]);
  });

  test("leave out a spell the book doesn't have, which they list", () => {
    const domains = new DomainSeeds(oneDomain("1st—fly, 2nd—unheard of."), ["Fly"]);
    expect(domains.seeds()[0].spells).toEqual([{ name: "Fly", level: 1 }]);
    expect(domains.unknownSpells()).toEqual([{ domain: "Test", level: 2, name: "unheard of" }]);
  });

  test("leave out a subdomain", () => {
    expect(new DomainSeeds(oneDomain("1st—fly.", true), ["Fly"]).seeds()).toEqual([]);
  });

  test("of the Core Rulebook name only spells the book has", () => {
    expect(new BookSeeds(CORE_BOOK).domains(reference()).unknownSpells()).toEqual([]);
  });
});
