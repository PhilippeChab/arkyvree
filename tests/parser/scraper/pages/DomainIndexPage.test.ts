import { describe, expect, test } from "bun:test";

import { DomainIndexPage } from "@/codegen/dnd3.5/tools/scraper/pages/DomainIndexPage.ts";
import { fixture } from "@/tests/support/scrapedPages.ts";

describe("A page of the domain index", () => {
  test("reads the domain versions it lists, and how many the index holds", () => {
    expect(new DomainIndexPage(fixture("domain-index")).read()).toEqual({
      entries: [
        { slug: "air", label: "Air" },
        { slug: "celerity-cd", label: "Celerity (CD)" },
        { slug: "celerity", label: "Celerity (SpC)" },
      ],
      total: 299,
    });
  });
});
