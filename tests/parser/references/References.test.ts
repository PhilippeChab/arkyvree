import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import type { ReferenceType, StoredReference } from "@/codegen/dnd3.5/tools/types/reference.ts";

/** A committed reference of `type` as stored. */
function stored<T extends ReferenceType>(file: string, type: T) {
  return structuredClone(References.stored(join(References.dir, file), type));
}

describe("A book's class references", () => {
  test("are its classes folder's reference files, sorted (the same on every filesystem), each loaded", () => {
    const files = readdirSync(join(References.dir, "srd", "classes"))
      .filter((file) => file.endsWith(".json"))
      .sort();
    const classes = References.loadClasses("srd");
    expect(classes.map(({ file }) => file)).toEqual(files);
    expect(classes.every(({ ref }) => ref._meta.type === "class" && ref.raw.name.length > 0)).toBe(true);
  });

  test("are none for a book without classes", () => {
    expect(References.loadClasses("a-book-without-classes")).toEqual([]);
  });
});

test("The books with references are their folders, sorted", () => {
  const folders = readdirSync(References.dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  expect(References.books()).toEqual(folders.sort());
});

describe("A loaded reference", () => {
  const FILES: [string, ReferenceType, { detected: boolean; mapping: boolean }][] = [
    ["srd/classes/barbarian.json", "class", { detected: true, mapping: true }],
    ["srd/feats.json", "feat", { detected: true, mapping: true }],
    ["srd/domains.json", "domain", { detected: true, mapping: true }],
    ["srd/races.json", "race", { detected: true, mapping: true }],
    ["srd/items.json", "item", { detected: true, mapping: true }],
    ["srd/magicItems.json", "magicItem", { detected: true, mapping: true }],
    ["srd/spells.json", "spell", { detected: true, mapping: true }],
    ["srd/wizardSchools.json", "wizardSchool", { detected: false, mapping: true }],
  ];

  test("keeps its overrides at the top, as stored, next to what it derives", () => {
    for (const [file, type, derives] of FILES) {
      const reference = stored(file, type);
      const loaded = References.resolve(type, reference);
      expect({
        file,
        overrides: loaded.overrides,
        detected: "detected" in loaded,
        mapping: "mapping" in loaded,
      }).toEqual({ file, overrides: reference.overrides, ...derives });
    }
  });

  test("sanitizes the overrides of the references it derives from, and keeps a spell's or a wizard school's as stored", () => {
    const edited = <T extends "feat" | "spell" | "wizardSchool">(file: string, type: T) => {
      const reference: StoredReference<T> = stored(file, type);
      const [name] = Object.keys(reference.overrides ?? {}).filter((key) => key !== "reviewed");
      reference.overrides = {
        ...reference.overrides,
        [name]: { ...reference.overrides?.[name], description: "It?s \u2019quoted\u2019" },
      };
      return References.resolve(type, reference).overrides?.[name]?.description;
    };
    expect(edited("srd/feats.json", "feat")).toBe("It's 'quoted'");
    expect(edited("srd/spells.json", "spell")).toBe("It?s \u2019quoted\u2019");
    expect(edited("srd/wizardSchools.json", "wizardSchool")).toBe("It?s \u2019quoted\u2019");
  });
});
