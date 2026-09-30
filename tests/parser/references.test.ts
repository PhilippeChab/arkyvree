import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { classReferences } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

describe("A book's class references", () => {
  test("are its classes folder's reference files, each loaded", () => {
    const files = readdirSync(join(REFERENCE_DIR, "srd", "classes")).filter((file) => file.endsWith(".json"));
    const classes = classReferences("srd");
    expect(classes.map(({ file }) => file)).toEqual(files);
    expect(classes.every(({ ref }) => ref._meta.type === "class" && ref.raw.name.length > 0)).toBe(true);
  });

  test("are none for a book without classes", () => {
    expect(classReferences("a-book-without-classes")).toEqual([]);
  });
});
