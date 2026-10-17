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
