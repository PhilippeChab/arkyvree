import { describe, expect, test } from "bun:test";

import { parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/cli/args.ts";

describe("A parser command's arguments", () => {
  test("name a book and a reference, and filter by type and key", () => {
    expect(parseCliArgs(["srd", "Wizard", "--type", "class", "--key", "requirements"])).toEqual({
      bookFilter: "srd",
      nameFilter: "wizard",
      typeFilter: "class",
      keyFilter: "requirements",
    });
    expect(parseCliArgs(["--type", "feat"])).toEqual({ typeFilter: "feat" });
  });

  test("refuse an option they don't know, which would be read as a book", () => {
    expect(() => parseCliArgs(["--book", "srd"])).toThrow("Unknown option --book");
  });
});
