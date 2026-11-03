import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import SheetBlocks from "@/engine/rulesets/dnd3.5/characters/description/SheetBlocks.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { readCharacterInput } from "@/server/services/characters/index.ts";
import { textOf } from "@/tests/support/printedPages.ts";
import { findSeededCharacter } from "@/tests/support/seed.ts";

/** A seeded character's sheet as the API describes it (its blocks), and its printed sheet's text, piece by piece. */
async function describeBoth(name: string) {
  const record = await findSeededCharacter(name);
  return await withRulesetScope(db, record.rulesetId, async (scope) => {
    const character = Engine.for(scope).character(await readCharacterInput(db, record));
    return {
      blocks: character.describe([], "show").blocks,
      text: textOf(character.describeSheet({ diagnostics: false }, "show")),
    };
  });
}

describe("CharacterSheet", () => {
  test("prints each skill's row as the sheet's skills block writes it, its cells in its columns' order, an empty one a dash", async () => {
    const { blocks, text } = await describeBoth("Bjorn Ironhand");
    const { columns, rows } = SheetBlocks.blockOf(blocks, "table", "skills").table;
    const page = text.slice(text.indexOf("Skills"), text.indexOf("Feats & Abilities"));

    const printed = (skill: string) => page.slice(page.indexOf(skill), page.indexOf(skill) + columns.length);
    // A class skill marked as the web sheet marks it: its rank, its ability, no misc bonus, its armor check, its total
    expect(printed("Climb *")).toEqual(["Climb *", "7", "+4", "—", "-7", "+4"]);
    for (const row of rows) expect(printed(row.cells.skill)).toEqual(columns.map(({ key }) => row.cells[key] || "—"));
  });

  test("prints the sheet's feats block's entries, a feat held more than once counted, then those granted without a pick", async () => {
    const { blocks, text } = await describeBoth("Aldric Dawnbringer");
    const { entries, granted } = SheetBlocks.blockOf(blocks, "entries", "feats");
    const labels = [...entries, ...(granted?.entries ?? [])].map(({ count, name }) =>
      count === undefined ? name : `${name} (x${count})`,
    );

    expect(labels).toContain("Smite Evil (Paladin) (x2)");
    const page = text.slice(text.indexOf("Feats & Abilities"));
    for (const label of labels) expect(page).toContain(label);
  });

  test("prints the sheet's inventory block's rows, each where it's held and how many, and the load they make", async () => {
    const { blocks, text } = await describeBoth("Bjorn Ironhand");
    const { load, rows } = SheetBlocks.blockOf(blocks, "inventory", "equipment");
    const page = text.slice(text.indexOf("Inventory"));

    let from = 0;
    for (const row of rows) {
      const at = page.indexOf(row.name, from);
      const held = row.held ? [] : ["unequipped"];
      expect(page.slice(at, at + held.length + 3)).toEqual([row.name, ...held, String(row.quantity), row.slot ?? "—"]);
      from = at + 1;
    }
    const [carried, ...limits] = load!.figures;
    expect(page.join("")).toContain(`${carried.label}: ${carried.weight} lbs`);
    for (const limit of limits) expect(page.join("")).toContain(`${limit.label}: ${limit.weight}`);
  });
});
