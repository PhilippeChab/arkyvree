import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReferenceOverrides } from "@/codegen/dnd3.5/tools/references/ReferenceOverrides.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";
import type { ReferenceFilters } from "@/codegen/dnd3.5/tools/types/reference.ts";

const folders: string[] = [];

/** The overrides parser:dnd3.5:overrides lists of the committed references `filters` picks: each entry's keys. */
function overridesOf(filters: ReferenceFilters) {
  return ReferenceOverrides.of(References.files(filters)).map(({ entryName, keys }) => ({ entryName, keys }));
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("parser:dnd3.5:overrides", () => {
  test("lists every type's overrides: a race's, a spell's, a magic item's, besides a feat's, a domain's and a class's", () => {
    expect(overridesOf({ bookFilter: "srd", typeFilter: "race" })).toContainEqual({
      entryName: "Halfling",
      keys: ["baseSpeed", "modifiers", "size"],
    });
    expect(overridesOf({ bookFilter: "srd", typeFilter: "spell" })).toContainEqual({
      entryName: "Bull's Strength",
      keys: ["levelEntries"],
    });
    expect(overridesOf({ bookFilter: "srd", typeFilter: "magicItem" })).toContainEqual({
      entryName: "Elven Chain",
      keys: ["template"],
    });
    expect(overridesOf({ bookFilter: "srd", nameFilter: "barbarian" })).toEqual([
      { entryName: "Barbarian", keys: ["alignment", "features"] },
    ]);
  });

  test("leaves out an override that only rewords a description", () => {
    const stored = References.stored(join(References.dir, "srd/wizardSchools.json"), "wizardSchool");
    expect(Object.keys(stored.overrides ?? {}).length).toBeGreaterThan(0);
    expect(overridesOf({ bookFilter: "srd", typeFilter: "wizardSchool" })).toEqual([]);
    expect(overridesOf({ bookFilter: "srd", typeFilter: "race" }).map(({ entryName }) => entryName)).not.toContain(
      "Gnome",
    );
  });

  test("lists an item's renaming by its scraped name, with its other keys", () => {
    const items = JSON.parse(readFileSync(join(References.dir, "srd/items.json"), "utf8"));
    items.overrides = {
      ...items.overrides,
      nameMap: { Sickle: "Laser sickle", Club: "Big club" },
      Club: { description: "A club.", weight: "4" },
    };
    const folder = mkdtempSync(join(tmpdir(), "references-"));
    folders.push(folder);
    writeFileSync(join(folder, "items.json"), JSON.stringify(items));
    const listed = ReferenceOverrides.of([References.file(join(folder, "items.json"))]);
    expect(listed.map(({ entryName, keys }) => ({ entryName, keys }))).toEqual([
      { entryName: "Club", keys: ["weight", "nameMap"] },
      { entryName: "Sickle", keys: ["nameMap"] },
    ]);
    expect(listed[0]).toMatchObject({ book: "srd", refType: "item", refName: "items" });
  });
});
