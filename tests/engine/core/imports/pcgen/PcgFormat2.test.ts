import { describe, expect, test } from "bun:test";

import PcgenFile from "@/engine/core/imports/pcgen/PcgenFile.ts";
import { readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";

describe("PcgFormat2", () => {
  test("reads who the character is, its scores and its levels in the order taken", async () => {
    const character = new PcgenFile(await readPcgenFile("brannoc")).read();
    expect(character.source).toEqual({ format: "2.0", program: "PCGen", version: "6.09.08.RC1" });
    expect(character.identity).toMatchObject({
      age: 27,
      height: 72,
      name: "Brannoc Vale",
      weight: 190,
      xp: 29500,
    });
    expect(character.identity.gender?.value).toBe("Male");
    expect(character.abilities.map(({ key, score }) => `${key} ${score}`)).toEqual([
      "STR 18",
      "DEX 14",
      "CON 14",
      "INT 12",
      "WIS 10",
      "CHA 8",
    ]);
    expect(character.levels.map(({ className, classLevel }) => `${className} ${classLevel}`)).toEqual([
      "Fighter 1",
      "Fighter 2",
      "Fighter 3",
      "Fighter 4",
      "Rogue 1",
      "Rogue 2",
      "Fighter 5",
      "Fighter 6",
    ]);
    expect(character.levels[3].abilityChanges).toEqual([{ amount: 1, key: "STR" }]);
  });

  test("reads the feats its user picked, in their pools, with their choices; what the rules give left out", async () => {
    const { feats } = new PcgenFile(await readPcgenFile("brannoc")).read();
    expect(feats.map(({ choice, name, pool }) => [pool, name, choice ?? ""])).toEqual([
      ["FEAT", "Cleave", ""],
      ["FEAT", "Exotic Weapon Proficiency", "Sword (Bastard)"],
      ["FEAT", "Power Attack", ""],
      ["FEAT", "Toughness", ""],
      ["Fighter Feat", "Dodge", ""],
      ["Fighter Feat", "Mobility", ""],
      ["Fighter Feat", "Weapon Focus", "Sword (Bastard)"],
      ["Fighter Feat", "Weapon Specialization", "Sword (Bastard)"],
    ]);
  });

  test("places its gear where the equipment set it uses wears it, what's in a container carried", async () => {
    const { gear } = new PcgenFile(await readPcgenFile("brannoc")).read();
    const placed = Object.fromEntries(gear.map(({ location, name }) => [name, location ?? "carried"]));
    expect(placed).toMatchObject({
      Bedroll: "carried",
      Chainmail: "Armor",
      "Ring of Protection +1": "Fingers",
      "Shield (Heavy/Metal)": "Shield",
      "Sword (Bastard)": "Primary Hand",
      "Thieves' Tools": "carried",
    });
    expect(gear.find(({ name }) => name === "Longsword +1")).toMatchObject({ baseName: "Longsword", magic: true });
    expect(gear.find(({ name }) => name === "Rations (Trail/Per Day)")?.quantity).toBe(5);
  });

  test("keeps the character's own text: its biography, its notes labelled", async () => {
    const { biography } = new PcgenFile(await readPcgenFile("brannoc")).read();
    expect(biography.description).toEqual([
      "A sellsword from the river towns, Brannoc learned his footwork from a gang of smugglers before taking up the blade again.",
    ]);
    expect(biography.notes).toEqual(["Handed: Right", "Eyes: Grey", "Hair: Black", "Money: 212.50"]);
  });

  test("lists what it doesn't read, with why, and leaves out PCGen's own settings", async () => {
    const text = `${await readPcgenFile("hilda")}\nFAVOREDCOLOR:Blue`;
    const { unread } = new PcgenFile(text).read();
    // The templates PCGen applies by itself (its race's, its subrace's, a class's, its own) are left out
    expect(unread.map(({ line, reason }) => `${line.text.split(/[|:]/)[0]}: ${reason}`)).toEqual([
      "SPELLNAME: Spells aren't imported yet",
      "SPELLNAME: Spells aren't imported yet",
      "SPELLNAME: Spells aren't imported yet",
      "FAVOREDCOLOR: Not read by the import",
    ]);
  });

  test("lists a line whose tag names an object's own member, as any it doesn't read", () => {
    const text = "PCGVERSION:2.0\nVERSION:6.09\nvalueOf:x\nconstructor:y\nALIGN:LG";
    const character = new PcgenFile(text).read();
    expect(character.unread.map(({ line }) => line.text)).toEqual(["valueOf:x", "constructor:y"]);
    expect(character.identity.alignment?.value).toBe("LG");
  });

  test("lists a template the character took, as templates aren't imported", () => {
    const text =
      "PCGVERSION:2.0\nVERSION:6.09\nRACE:Human\nTEMPLATESAPPLIED:[NAME:Human Base]\nTEMPLATESAPPLIED:[NAME:Half-Celestial]";
    expect(new PcgenFile(text).read().unread.map(({ line }) => line.text)).toEqual([
      "TEMPLATESAPPLIED:[NAME:Half-Celestial]",
    ]);
  });

  test("lists a class line that records a choice of the class's, as class feature choices aren't imported", () => {
    const text = [
      "PCGVERSION:2.0",
      "VERSION:6.09",
      "CLASS:Wizard|LEVEL:1|SUBCLASS:Evoker|PROHIBITED:Enchantment",
      "CLASS:Fighter|LEVEL:1|SUBCLASS:None",
    ].join("\n");
    expect(new PcgenFile(text).read().unread.map(({ line, reason }) => `${line.number} ${reason}`)).toEqual([
      "3 Class feature choices aren't imported: pick it in the app",
    ]);
  });

  test("reads a line crafted to make a pattern backtrack in a time its length bounds", () => {
    const data = "EQMOD=".repeat(40_000);
    const name = `${"aA".repeat(40_000)} x`;
    const text = `PCGVERSION:2.0\nVERSION:6.09\nEQUIPNAME:x|CUSTOMIZATION:[DATA:${data}]\nTEMPLATESAPPLIED:[NAME:${name}]`;
    const started = performance.now();
    expect(new PcgenFile(text).read().gear.map(({ magic }) => magic)).toEqual([false]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("reads the charges an item has left, and what the character owns without carrying it", () => {
    const text = [
      "PCGVERSION:2.0",
      "VERSION:6.09",
      "EQUIPNAME:Wand|QUANTITY:1.0|CUSTOMIZATION:[BASEITEM:Wand|DATA:EQMOD=CHARGED&pipe;CHARGES&lbracket;23&rbracket;]",
      "EQUIPNAME:Tent|QUANTITY:2.0",
      "EQUIPSET:Default Set|ID:0.1",
      "EQUIPSET:Carried|ID:0.1.01|VALUE:Wand|QUANTITY:1.0",
      "EQUIPSET:Carried|ID:0.1.02|VALUE:Tent|QUANTITY:1.0",
      "CALCEQUIPSET:0.1",
    ].join("\n");
    const { gear } = new PcgenFile(text).read();
    expect(gear.map(({ charges, name, notCarried, quantity }) => ({ charges, name, notCarried, quantity }))).toEqual([
      { charges: 23, name: "Wand", notCarried: undefined, quantity: 1 },
      { charges: undefined, name: "Tent", notCarried: undefined, quantity: 1 },
      { charges: undefined, name: "Tent", notCarried: true, quantity: 1 },
    ]);
  });

  test("holds a pair of one weapon one in each hand, and sets apart what a container left at home holds", () => {
    const text = [
      "PCGVERSION:2.0",
      "VERSION:6.09",
      "EQUIPNAME:Dagger|QUANTITY:3.0",
      "EQUIPNAME:Chest|QUANTITY:1.0",
      "EQUIPNAME:Gold Bar|QUANTITY:5.0",
      "EQUIPSET:Default Set|ID:0.1",
      "EQUIPSET:Two Weapons|ID:0.1.01|VALUE:Dagger|QUANTITY:3.0",
      "EQUIPSET:Not Carried|ID:0.1.02|VALUE:Chest|QUANTITY:1.0",
      "EQUIPSET:Chest|ID:0.1.02.01|VALUE:Gold Bar|QUANTITY:5.0",
      "CALCEQUIPSET:0.1",
    ].join("\n");
    const { gear } = new PcgenFile(text).read();
    expect(
      gear.map(({ location, name, notCarried, quantity }) => [name, location ?? "", notCarried ?? false, quantity]),
    ).toEqual([
      ["Dagger", "Primary Hand", false, 1],
      ["Dagger", "Secondary Hand", false, 1],
      ["Dagger", "", false, 1],
      ["Chest", "", true, 1],
      ["Gold Bar", "", true, 5],
    ]);
  });

  test("reads the rings worn as one entry, leaves out PCGen's sheet settings, and lists a chronicle", () => {
    const text = [
      "PCGVERSION:2.0",
      "VERSION:6.09",
      "FAVOREDCLASS:Fighter",
      "OUTPUTSHEETHTML:sheet.htm",
      "PREVIEWVAR:x",
      "PORTRAITTHUMBNAILRECT:12,4,96,96",
      "CHRONICLEENTRY:[EXPORT:Y|CAMPAIGN:Saga|ADVENTURE:The Keep|XP:500|CHRONICLE:Cleared the keep]",
      "EQUIPNAME:Ring of Protection +1|QUANTITY:3.0",
      "EQUIPSET:Default Set|ID:0.1",
      "EQUIPSET:Fingers|ID:0.1.01|VALUE:Ring of Protection +1|QUANTITY:3.0",
      "CALCEQUIPSET:0.1",
    ].join("\n");
    const { gear, unread } = new PcgenFile(text).read();
    expect(gear.map(({ location, quantity }) => `${location ?? "carried"} ${quantity}`)).toEqual(["Fingers 3"]);
    expect(unread.map(({ reason }) => reason)).toEqual(["Chronicle entries aren't imported: add them to the notes"]);
  });

  test("reads an item whose note opens a bracket it doesn't close, as PCGen writes a note as it is", () => {
    const text = [
      "PCGVERSION:2.0",
      "VERSION:6.09",
      "EQUIPNAME:Wand|QUANTITY:1.0|NOTE:recharge? [ask GM|CUSTOMIZATION:[BASEITEM:Wand|DATA:EQMOD=CHARGES[23]$]",
    ].join("\n");
    expect(new PcgenFile(text).read().gear[0]).toMatchObject({ charges: 23, name: "Wand" });
  });

  test("reads PCGen 5's feat lines too, in its general pool", () => {
    const text = "PCGVERSION:2.0\nVERSION:5.6.0\nFEAT:Weapon Focus|APPLIEDTO:Morningstar|TYPE:GENERAL.FIGHTER";
    expect(new PcgenFile(text).read().feats).toEqual([
      {
        choice: "Morningstar",
        line: { number: 3, text: "FEAT:Weapon Focus|APPLIEDTO:Morningstar|TYPE:GENERAL.FIGHTER" },
        name: "Weapon Focus",
        pool: "FEAT",
      },
    ]);
  });
});
