import { describe, expect, test } from "bun:test";

import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import SheetBlocks from "@/engine/rulesets/dnd3.5/characters/description/SheetBlocks.ts";

/** What the sheet reads of a character's combat. */
type Combat = ReturnType<Parameters<typeof CombatSheet.describe>[0]["getCombat"]>;

/** A weapon set's slots, as the sheet reads them. */
type WeaponSetSlots = Combat["weaponsets"][string];

/** The combat block of a character with these weapon sets. */
function combatBlock(weaponsets: Combat["weaponsets"]) {
  const combat = CombatSheet.describe({
    getCombat: () => ({
      ac: {},
      bab: 1,
      encumbrance: {
        carriedweight: 0,
        checkpenalty: 0,
        heavyload: 100,
        lightload: 33,
        load: "light",
        maxdex: 99,
        mediumload: 66,
      },
      grapple: { total: 1 },
      hp: { total: 8 },
      initiative: { total: 2 },
      speed: { total: 30 },
      weaponsets,
    }),
  });
  const [, , block] = SheetBlocks.describe({ abilities: [], combat, saves: {} });
  if (block.kind !== "stats") throw new Error("no combat block");
  return block;
}

/** A weapon as the sheet reads it: a longsword, `proficient` or not, its attack +3, 1d8 slashing, 19–20/×2. */
function longsword(proficient: boolean): NonNullable<WeaponSetSlots["mainhand"]> {
  return {
    itemId: "longsword",
    name: "Longsword",
    proficient,
    natural: null,
    range: 0,
    maxRange: 0,
    ranged: false,
    thrown: null,
    twoweapon: null,
    offend: null,
    tohit: { total: [3] },
    damage: { total: "1d8+1", critical: { range: 2, multiplier: 2 }, types: ["Slashing"] },
  };
}

/** A set holding `mainhand` and a shield named `shield`, its armor class 15. */
function set(mainhand: WeaponSetSlots["mainhand"], shield: string[] = []): WeaponSetSlots {
  return {
    ac: { total: 15, touch: 11, flatfooted: 13 },
    shield: { names: shield },
    mainhand,
    offhand: null,
    twohanded: null,
  };
}

describe("SheetBlocks", () => {
  test("heads each weapon set with its number and what its hands hold, and lists its attacks", () => {
    const block = combatBlock({ "0": set(longsword(true), ["Heavy Steel Shield"]), "1": set(null) });

    expect(block.stats.map(({ label }) => label)).toEqual(["HP", "Initiative", "Speed", "BAB", "Grapple"]);
    expect(block.panels.map(({ key, heading }) => [key, heading])).toEqual([
      ["0", { label: "Set 1", note: "Longsword, Heavy Steel Shield" }],
      ["1", { label: "Set 2" }],
    ]);
    expect(block.panels[0].boxes).toEqual([
      { label: "AC", value: "15" },
      { label: "Touch", value: "11" },
      { label: "Flat-footed", value: "13" },
    ]);
    expect(block.panels[0].table?.rows).toEqual([
      {
        key: "Main Hand",
        caption: "Main Hand",
        cells: {
          weapon: "Longsword",
          attack: "+3",
          damage: "1d8+1",
          critical: "19–20/×2",
          range: "",
          increment: "",
          type: "Slashing",
        },
      },
    ]);
    // A set without a weapon says so
    expect(block.panels[1].table).toMatchObject({ rows: [], empty: "No weapons equipped" });
  });

  test("flags an attack with a weapon its wielder isn't proficient with", () => {
    const block = combatBlock({ "0": set(longsword(false)) });
    expect(block.panels[0].table?.rows[0].alert).toBe("Not Proficient (-4)");
  });

  test("gives a character whose hands hold nothing its one loadout with no heading", () => {
    const block = combatBlock({ "0": set(null) });
    expect(block.panels).toHaveLength(1);
    expect(block.panels[0]).not.toHaveProperty("heading");
  });

  test("puts each table column where a phone shows it, its empty cells hidden where they may be", () => {
    const columns = combatBlock({ "0": set(longsword(true)) }).panels[0].table?.columns ?? [];
    expect(columns.map(({ key, slot, hideEmpty }) => [key, slot, !!hideEmpty])).toEqual([
      ["weapon", "primary", false],
      ["attack", "trailing", false],
      ["damage", "inline", true],
      ["critical", "inline", false],
      ["range", "inline", true],
      ["increment", "inline", true],
      ["type", "inline", true],
    ]);
  });
});
