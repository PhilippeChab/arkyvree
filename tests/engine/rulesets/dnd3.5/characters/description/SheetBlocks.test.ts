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
  const [, , block] = SheetBlocks.describe({
    abilities: [],
    classes: {},
    combat,
    saves: {},
    skills: {},
    spellGroups: [],
    spellsPerDay: { labels: [], levels: [], lists: [] },
    virtualFeats: [],
  });
  if (block.kind !== "stats") throw new Error("no combat block");
  return block;
}

/** A feat, held at a level: `stackable` or not. */
function feat(id: string, name: string, stackable = false) {
  return { id, name, description: `${name}'s benefit`, stackable };
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

/** The blocks of a sheet with only these feats, at levels in this order, and these spells. */
function sheetWith(
  levelFeats: ReturnType<typeof feat>[][],
  virtualFeats: ReturnType<typeof feat>[] = [],
  spells: Pick<Parameters<typeof SheetBlocks.describe>[0], "spellGroups" | "spellsPerDay"> = {
    spellGroups: [],
    spellsPerDay: { labels: [], levels: [], lists: [] },
  },
) {
  return SheetBlocks.describe({
    abilities: [],
    classes: { fighter: { levels: levelFeats.map((feats) => ({ feats })) } },
    combat: CombatSheet.describe({
      getCombat: () => ({
        ac: {},
        bab: 0,
        encumbrance: {
          carriedweight: 0,
          checkpenalty: 0,
          heavyload: 100,
          lightload: 33,
          load: "light",
          maxdex: 99,
          mediumload: 66,
        },
        grapple: { total: 0 },
        hp: { total: 0 },
        initiative: { total: 0 },
        speed: { total: 30 },
        weaponsets: {},
      }),
    }),
    saves: {},
    skills: {},
    virtualFeats,
    ...spells,
  });
}

describe("SheetBlocks", () => {
  test("lists the feats taken, a stackable one held twice counted on one entry, and those granted apart", () => {
    const toughness = feat("toughness", "Toughness", true);
    const focus = feat("focus", "Weapon Focus");
    const feats = sheetWith([[toughness, focus], [toughness], [focus]], [feat("track", "Track")]).find(
      (block) => block.key === "feats",
    );
    if (feats?.kind !== "entries") throw new Error("no feats");
    expect(feats.entries.map(({ name, count }) => [name, count])).toEqual([
      ["Toughness", 2],
      ["Weapon Focus", undefined],
      ["Weapon Focus", undefined],
    ]);
    expect(feats.granted).toEqual({
      label: "Granted",
      entries: [{ key: "track", id: "track", name: "Track", description: "Track's benefit" }],
    });
    // None granted: no heading for them
    const plain = sheetWith([[focus]]).find((block) => block.key === "feats");
    expect(plain).not.toHaveProperty("granted");
  });

  test("lists no spells for a character with neither spells nor slots", () => {
    expect(sheetWith([]).map(({ key }) => key)).toEqual(["abilities", "saves", "combat", "skills", "feats"]);
  });

  test("lists the spells by list and level, each level's uses, and the slots per day", () => {
    const spell = {
      dc: null,
      description: "",
      details: [],
      id: "light",
      name: "Light",
      properties: {},
      save: "",
      school: "Evocation",
      tags: [{ name: "Sun", joinsClassList: true }],
    };
    const blocks = sheetWith([], [], {
      spellGroups: [
        {
          aptitudeName: "Wizard",
          levels: [{ aptitudeName: "Wizard", label: "Level 0", level: 0, spells: [spell], uses: 3 }],
        },
      ],
      spellsPerDay: { labels: ["0"], levels: [0], lists: [{ aptitudeName: "Wizard", slots: ["3+1"] }] },
    });
    const spells = blocks.find((block) => block.key === "spells");
    if (spells?.kind !== "pools") throw new Error("no spells");
    expect(spells.counts).toEqual({
      title: "Spells per Day",
      corner: "Spell List",
      tiers: ["0"],
      lists: [{ name: "Wizard", counts: ["3+1"] }],
    });
    expect(spells.pools[0].tiers[0]).toMatchObject({ label: "Level 0", note: "3/day" });
    expect(spells.pools[0].tiers[0].entries[0]).toMatchObject({
      cells: { name: "Light", school: "Evocation", save: "", dc: "" },
      tags: [{ name: "Sun", tone: "secondary" }],
    });
  });

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
