import type { CharacterInput, CharacterRows } from "@/engine/index.ts";
import type { Db } from "@/server/database/index.ts";
import {
  Campaigns,
  CharacterAbilities,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  Modifiers,
  PlayerCharacters,
  Players,
  Requirements,
  Visibility,
} from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

/** A master's bonded creatures, each with its rows, read in the master's ruleset's scope: archived ones with it. */
export async function readBondedInputs(database: Db, master: Character): Promise<CharacterInput[]> {
  const inputs: CharacterInput[] = [];
  for (const creature of await Characters.findMany(database, { parentCharacterId: master.id }, Visibility.All))
    inputs.push(await readCharacterInput(database, creature));
  return inputs;
}

/** A character's row and its rows, read in its ruleset's scope: what the engine builds it from. */
export async function readCharacterInput(database: Db, record: Character): Promise<CharacterInput> {
  return { record, rows: await readCharacterRows(database, record) };
}

/**
 * The character's own rows (`CharacterRows`), read through `database` in its ruleset's scope, so their references are
 * the view's: its seat in a campaign, its ability scores, languages, inventory and levels, every saved level's picks,
 * and the modifiers set on the character, then their requirements.
 */
export async function readCharacterRows(database: Db, character: Character): Promise<CharacterRows> {
  const characterId = character.id;
  const playerCharacter = await PlayerCharacters.findOne(database, { characterId });
  const player = playerCharacter ? await Players.findOne(database, { id: playerCharacter.playerId }) : undefined;
  const campaign = player ? await Campaigns.findOne(database, { id: player.campaignId }) : undefined;
  const abilities = await CharacterAbilities.findMany(database, { characterId });
  const languages = await CharacterLanguages.findMany(database, { characterId });
  const inventory = await CharacterInventory.findMany(database, { characterId });
  const levels = await CharacterLevels.findMany(database, { characterId });
  const characterLevelIds = levels.map((level) => level.id);
  const picks = {
    skills: await CharacterLevelSkills.findMany(database, { characterLevelIds }),
    feats: await CharacterLevelFeats.findMany(database, { characterLevelIds }),
    powers: await CharacterLevelPowers.findMany(database, { characterLevelIds }),
  };
  const modifiers = await Modifiers.findMany(database, { sourceIds: [characterId] });
  const requirements = await Requirements.findMany(database, { entityIds: modifiers.map((modifier) => modifier.id) });
  return { player, campaign, abilities, languages, inventory, levels, picks, modifiers, requirements };
}

/** A bonded creature's master, with its rows, read in the creature's ruleset's scope: archived too. */
export async function readMasterInput(database: Db, creature: Character): Promise<CharacterInput> {
  const master = creature.parentCharacterId
    ? await Characters.findOne(database, { id: creature.parentCharacterId }, Visibility.All)
    : undefined;
  if (!master) throw new Error(`Bonded's master not found: ${creature.parentCharacterId}`);
  return await readCharacterInput(database, master);
}
