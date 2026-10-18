import { describe, expect, test } from "bun:test";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import {
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevels,
  Characters,
} from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { activityTypes } from "@/tests/support/activities.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { type PcgenCharacter, readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's import of a PCGen character into the seeded ruleset: the user, and what the import answered. */
async function importAsNewUser(name: PcgenCharacter) {
  const { user, session } = await createTestUser();
  const { rulesetId } = await getSeedCtx();
  const imported = await CharactersService.importCharacter(session, rulesetId, await readPcgenFile(name));
  return { imported, user };
}

describe("Imports", () => {
  test("creates the character a PCGen file holds, as the engine plans it, a valid one", async () => {
    const { imported, user } = await importAsNewUser("brannoc");
    const { character } = imported;
    expect(character).toMatchObject({ name: "Brannoc Vale", userId: user.id, xp: 29500 });

    const levels = await CharacterLevels.findMany(db, { characterId: character.id });
    expect(levels).toHaveLength(8);
    const feats = await CharacterLevelFeats.findMany(db, { characterLevelIds: levels.map((level) => level.id) });
    expect(feats).toHaveLength(8);
    expect(await CharacterLanguages.findMany(db, { characterId: character.id })).toHaveLength(1);
    expect(await CharacterInventory.findMany(db, { characterId: character.id })).toHaveLength(12);

    // Built as the app builds it, it passes every check a level-up runs
    const built = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: character.id }))!);
    expect(built.validate()).toEqual({ issues: [], valid: true });

    expect(await activityTypes(user.id, charactersInCharacter, character.id)).toEqual(["createCharacter"]);
  });

  test("answers the report of what it imported and every line it couldn't match", async () => {
    const { imported } = await importAsNewUser("hilda");
    expect(imported.report.program).toBe("PCGen 6.09.08.RC1");
    expect(imported.report.imported).toContain("Race: Dwarf");
    expect(imported.report.unmatched).toEqual([]);
  });

  test("refuses a ruleset the session can't create characters in", async () => {
    const { user: owner } = await createTestUser();
    const ruleset = await createTestRuleset(owner.id);
    const { session } = await createTestUser();
    const text = await readPcgenFile("brannoc");
    expect(CharactersService.importCharacter(session, ruleset.id, text)).rejects.toThrow(ForbiddenError);
  });

  test("answers what a file is before a ruleset is picked: its program, version, format and rules", async () => {
    expect(CharactersService.getImportSource(await readPcgenFile("hilda"))).toEqual({
      baseRules: ["Dungeons & Dragons: 3.5"],
      source: { format: "2.0", program: "PCGen", rules: "35e", version: "6.09.08.RC1" },
    });
  });

  test("answers why no ruleset imports a file: another game mode's character, or a file no importer recognizes", async () => {
    const pathfinder = (await readPcgenFile("hilda")).replace("GAMEMODE:35e", "GAMEMODE:Pathfinder_RPG");
    expect(CharactersService.getImportSource(pathfinder)).toEqual({
      baseRules: [],
      refusal: "This file is a character of PCGen's Pathfinder_RPG game mode: a 3.5 ruleset imports its 35e characters",
      source: { format: "2.0", program: "PCGen", rules: "Pathfinder_RPG", version: "6.09.08.RC1" },
    });
    expect(CharactersService.getImportSource("Not a character")).toEqual({
      baseRules: [],
      refusal: "This isn't a character file the app imports: it imports PCGen's",
    });
  });
});
