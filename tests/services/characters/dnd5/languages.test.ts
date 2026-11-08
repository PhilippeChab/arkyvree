import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { CharacterLinks } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { createDnd5Character } from "@/tests/support/dnd5/characters.ts";
import { addLevel } from "@/tests/support/dnd5/levels.ts";
import { getDnd5SeedCtx } from "@/tests/support/dnd5/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { DND5_BASE_RULES } from "@/vocabulary/dnd5/baseRules.ts";

const session = makeSession();

/** A new character of a class's first level (`klass`), forced past its picks. */
async function firstLevelOf(klass: string, hp: number) {
  const character = await createDnd5Character(session);
  await addLevel(session, character.id, klass, 1, { hp }, true);
  return character;
}

/** Saves a character's language picks, by name. */
async function speak(characterId: string, languages: string[]) {
  const { langMap } = await getDnd5SeedCtx();
  return await CharactersService.updateCharacter(session, characterId, {
    links: { speaks: languages.map((name) => langMap[name]) },
  });
}

/** The languages a character picked, by name. */
async function spokenBy(characterId: string) {
  const { langMap } = await getDnd5SeedCtx();
  const names = new Map(Object.entries(langMap).map(([name, id]) => [id, name]));
  const links = (await CharacterLinks.findPerRole(db, DND5_BASE_RULES, { characterId })).speaks ?? [];
  return links.map(({ entityId }) => names.get(entityId)).toSorted();
}

describe("A D&D 5th Edition character's languages", () => {
  test("are two standard picks, and as many rare ones as a feature's extra picks", async () => {
    // A fighter's two picks are standard: a rare language is refused
    const fighter = await firstLevelOf("Fighter", 10);
    expect(speak(fighter.id, ["Elvish", "Abyssal"])).rejects.toMatchObject({
      message: "Abyssal is a rare language: only a feature that gives a language pick lets a character pick it",
    });
    await speak(fighter.id, ["Elvish", "Dwarvish"]);
    expect(await spokenBy(fighter.id)).toEqual(["Dwarvish", "Elvish"]);
    // A rogue's Thieves' Cant gives one more "from the language tables": a rare one, but one only
    const rogue = await firstLevelOf("Rogue", 8);
    await speak(rogue.id, ["Elvish", "Dwarvish", "Abyssal"]);
    expect(await spokenBy(rogue.id)).toEqual(["Abyssal", "Dwarvish", "Elvish"]);
    expect(speak(rogue.id, ["Elvish", "Celestial", "Abyssal"])).rejects.toMatchObject({
      message: "Celestial is a rare language: only a feature that gives a language pick lets a character pick it",
    });
  });
});
