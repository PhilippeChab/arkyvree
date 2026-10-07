import { describe, expect, test } from "bun:test";

import { DomainPage } from "@/codegen/dnd3.5/tools/scraper/pages/DomainPage.ts";
import { fixture, named, stored } from "@/tests/support/scrapedPages.ts";

describe("A domain version's page", () => {
  test("reads its label, book, page, granted power and spells; its label, its name and its book's code", () => {
    const weather = named(stored("complete-divine/domains.json", "domain").raw, ["Weather"])[0];
    expect(new DomainPage(fixture("domain-weather")).read()).toEqual({
      label: "Weather (CD)",
      bookSlug: "complete-divine--56",
      page: weather.page,
      description: weather.description,
      spells: [
        { path: "complete-divine--56/binding-winds--692", name: "Binding Winds", edition: "Supplementals (3.5)" },
        { path: "players-handbook-v35--6/call-lightning--2592", name: "Call Lightning", edition: "Core (3.5)" },
      ],
    });
    // A version whose page names no book, nor its granted power: its label's code places it
    expect(new DomainPage(fixture("domain-glory-cd")).read()).toEqual({
      label: "Glory (CD)",
      description: "",
      spells: [
        { path: "complete-divine--56/crown-of-glory--697", name: "Crown of Glory", edition: "Supplementals (3.5)" },
      ],
    });
    expect([
      DomainPage.nameOf("Glory (CD)"),
      DomainPage.bookCodeOf("Glory (CD)"),
      DomainPage.bookCodeOf("Air"),
    ]).toEqual(["Glory", "CD", undefined]);
  });
});
