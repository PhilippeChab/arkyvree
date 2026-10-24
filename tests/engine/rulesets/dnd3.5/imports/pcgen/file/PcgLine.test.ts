import { describe, expect, test } from "bun:test";

import PcgLine from "@/engine/rulesets/dnd3.5/imports/pcgen/file/PcgLine.ts";

/** A line of a file, its first. */
function lineOf(text: string) {
  return new PcgLine({ number: 1, text });
}

describe("PcgLine", () => {
  test("reads a line's tags, the first naming what it holds", () => {
    const line = lineOf("SKILL:Climb|OUTPUTORDER:5|CLASSBOUGHT:[CLASS:Fighter|RANKS:11.0|COST:1|CLASSSKILL:Y]");
    expect(line.tag).toBe("SKILL");
    expect(line.value).toBe("Climb");
    expect(line.find("OUTPUTORDER")).toBe("5");
    expect(PcgLine.nested(line.find("CLASSBOUGHT")!)).toEqual([
      { tag: "CLASS", value: "Fighter" },
      { tag: "RANKS", value: "11.0" },
      { tag: "COST", value: "1" },
      { tag: "CLASSSKILL", value: "Y" },
    ]);
  });

  test("decodes PCGen's entities once a value is split", () => {
    const line = lineOf("CHARACTERMAGIC:Ring &lbracket;Air&rbracket;&nl;Gust&colon; twice&pipe;day &amp; night");
    expect(line.value).toBe("Ring [Air]\nGust: twice|day & night");
    expect(PcgLine.nested("[DATA:A&pipe;B]")).toEqual([{ tag: "DATA", value: "A|B" }]);
  });

  test("reads every value of a tag the line repeats, and none of a tag it lacks", () => {
    const line = lineOf("LANGUAGE:Common|LANGUAGE:Dwarven|");
    expect(line.findAll("LANGUAGE")).toEqual(["Common", "Dwarven"]);
    expect(line.find("LANGUAGE")).toBe("Dwarven");
    expect(line.find("KEY")).toBeUndefined();
  });

  test("splits a line holding characters past the basic plane where its `|` stands", () => {
    const line = lineOf("NOTE:🐉🐉 Dragons|VALUE:x");
    expect(line.tags).toEqual([
      { tag: "NOTE", value: "🐉🐉 Dragons" },
      { tag: "VALUE", value: "x" },
    ]);
  });

  test("reads a line without a value, a comment's", () => {
    expect(lineOf("# Character Bio").tags).toEqual([{ tag: "# Character Bio", value: "" }]);
  });
});
