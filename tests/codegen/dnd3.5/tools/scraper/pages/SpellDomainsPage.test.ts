import { describe, expect, test } from "bun:test";

import { SpellDomainsPage } from "@/codegen/dnd3.5/tools/scraper/pages/SpellDomainsPage.ts";
import { fixture } from "@/tests/support/scrapedPages.ts";

describe("A spell's page of domain levels", () => {
  test("reads the spell's level in each domain version", () => {
    // The domain versions only, not the classes
    expect(new SpellDomainsPage(fixture("domain-spell-levels")).levels()).toEqual(
      new Map([
        ["treachery", 1],
        ["liberation-cd", 1],
      ]),
    );
  });
});
