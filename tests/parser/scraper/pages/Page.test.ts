import { describe, expect, test } from "bun:test";

import * as cheerio from "cheerio";

import { Page } from "@/codegen/dnd3.5/tools/scraper/pages/Page.ts";

describe("A section", () => {
  test("is what follows its heading, up to the next heading", () => {
    const $ = cheerio.load(
      "<h3>Traits</h3><p>one</p><ul><li>two</li></ul><h4>Sub</h4><p>three</p><h3>Next</h3><p>four</p>",
    );
    const texts = (stops?: string[]) => Page.section($("h3").first(), stops).map((el) => el.text());
    expect(texts()).toEqual(["one", "two", "Sub", "three"]);
    expect(texts(["h3", "h4"])).toEqual(["one", "two"]);
  });
});
