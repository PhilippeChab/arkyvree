import { describe, expect, test } from "bun:test";
import { sanitizeHtml, sanitizeText, sortKeysDeep } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";

describe("Scraped HTML", () => {
  test("loses its scripts", () => {
    expect(sanitizeHtml("<p>a</p><script>ad()</script><noscript>no</noscript><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });

  test("gets its broken closing tags fixed, keeping the lines", () => {
    expect(sanitizeHtml("<p>a</\n<p>b</p\n")).toBe("<p>a</p>\n<p>b</p>\n");
  });

  test("gets its apostrophes, typos and encoding fixed", () => {
    expect(sanitizeHtml("<p>It?s Enhanse profi ciency &#8217;x&#8217; &mdash; “q”&nbsp;…</p>"))
      .toBe(`<p>It's Enhance Proficiency 'x' - "q" ...</p>`);
  });
});

describe("Scraped text", () => {
  test("gets its encoding fixed and its lines joined", () => {
    expect(sanitizeText("dogs? ‘bone’\n  and  cats")).toBe("dogs' 'bone' and cats");
  });
});

describe("A reference's JSON", () => {
  test("is written with every object's keys sorted, its arrays kept in order", () => {
    const sorted = sortKeysDeep({ b: 1, a: { d: [{ z: 1, y: 2 }, 3], c: null } });
    expect(JSON.stringify(sorted)).toBe(`{"a":{"c":null,"d":[{"y":2,"z":1},3]},"b":1}`);
  });
});
