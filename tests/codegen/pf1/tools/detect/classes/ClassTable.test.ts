import { describe, expect, test } from "bun:test";

import { ClassTable } from "@/codegen/pf1/tools/detect/classes/ClassTable.ts";

/** A wizard's first three levels' progression, its saves' columns headed `fort`, `ref` and `will`. */
function wizardTable(fort = "Fort Save", ref = "Ref Save", will = "Will Save") {
  return new ClassTable({
    name: "Wizard",
    tables: [
      {
        columns: ["Level", "Base Attack Bonus", fort, ref, will, "Special"],
        rows: [
          ["1st", "+0", "+0", "+0", "+2", "Arcane bond, arcane school, cantrips, Scribe Scroll"],
          ["2nd", "+1", "+0", "+0", "+3", ""],
          ["3rd", "+1", "+1", "+1", "+3", ""],
        ],
      },
    ],
  });
}

describe("A class's progression table", () => {
  test("reads its base attack bonus and saves as the presets their columns follow", () => {
    const table = wizardTable();
    expect(table.bab()).toBe("poor");
    expect(table.saves()).toEqual({ fortitude: "poor", reflex: "poor", will: "good" });
  });

  test("refuses a save's column it lacks, which would follow every progression", () => {
    expect(() => wizardTable("Fort").saves()).toThrow(`Wizard's progression table has no "Fort Save" column`);
  });

  test("refuses a table without a level", () => {
    const table = new ClassTable({
      name: "Wizard",
      tables: [{ columns: ["Level", "Base Attack Bonus"], rows: [] }],
    });
    expect(() => table.bab()).toThrow(`Wizard's "Base Attack Bonus" column has 0 cells for 0 levels`);
  });
});
