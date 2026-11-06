import { describe, expect, test } from "bun:test";

import { DomainPage } from "@/codegen/pf1/tools/scraper/pages/DomainPage.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

/** A domain's page of a domain and a subdomain, in the parser's own words. */
const STORMS =
  '<html><body><div id="main"><h1 class="title">Storms</h1><b>Source</b> <i>Book pg. 1</i><br />' +
  "<b>Deities</b>: Someone, Someone Else<br /><br /><b>Granted Powers</b>: You call the wind.<br /><br />" +
  "<i>Gust (Sp)</i>: You push a foe 5 feet.<br /><br /><b>Domain Spells</b>: 1st—gust of wind.<br />" +
  '<h2 class="title">Squall Subdomain</h2><b>Source</b> <i>Later Book pg. 2</i><br /><b>Associated Domain(s)</b>: Storms' +
  "<br /><b>Associated Deities</b>: Someone<br /><br /><b>Replacement Power</b>: This replaces Gust.<br /><br />" +
  "<i>Squall (Su)</i>: Rain falls.</div></body></html>";

describe("A domain's page", () => {
  test("reads the domain: its granted powers, each power labelled in italics, and its spells", () => {
    const air = new DomainPage(fixture("domain-air")).readDomain("Air")!;
    expect(air).toMatchObject({ name: "Air", subdomain: false, sources: [{ book: "PRPG Core Rulebook", page: 41 }] });
    expect(air.details.map(({ label }) => label)).toEqual([
      "Granted Powers",
      "Lightning Arc (Sp)",
      "Electricity Resistance (Ex)",
      "Domain Spells",
    ]);
    expect(air.details[3].text).toStartWith("1st—obscuring mist, 2nd—wind wall");
  });

  test("leaves out its deities, whose names are product identity", () => {
    const storms = new DomainPage(STORMS).readDomain("Storms")!;
    expect(storms.details.map(({ label }) => label)).toEqual(["Granted Powers", "Gust (Sp)", "Domain Spells"]);
  });

  test("reads a subdomain off its section, with its own sources, its deities left out, and none it has no section of", () => {
    const page = new DomainPage(STORMS);
    expect(page.readSubdomain("Squall")).toEqual({
      name: "Squall",
      subdomain: true,
      sources: [{ book: "Later Book", page: 2 }],
      details: [
        { label: "Associated Domain(s)", text: "Storms" },
        { label: "Replacement Power", text: "This replaces Gust." },
        { label: "Squall (Su)", text: "Rain falls." },
      ],
    });
    expect(page.readSubdomain("Drizzle")).toBeUndefined();
  });
});
