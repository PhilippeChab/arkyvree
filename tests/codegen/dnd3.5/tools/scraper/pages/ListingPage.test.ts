import { describe, expect, test } from "bun:test";

import { ListingPage } from "@/codegen/dnd3.5/tools/scraper/pages/ListingPage.ts";

describe("A listing page's entries", () => {
  test("are the first link of each row leading into its section", () => {
    const html = `<table>
      <tr><th>Name</th></tr>
      <tr><td><a href="/feats/srd/power-attack--1/">Power Attack</a></td><td><a href="/rulebooks/srd/">SRD</a></td></tr>
      <tr><td><a href="/spells/srd/fireball--1/">Fireball</a></td></tr>
      <tr><td>No link</td></tr>
    </table>`;
    expect(new ListingPage(html).entries("feats")).toEqual([
      { name: "Power Attack", url: "/feats/srd/power-attack--1/" },
    ]);
  });
});
