import type { Db } from "@/drizzle/database.ts";
import type { CharacterInput, CharacterRows } from "@/engine/index.ts";
import {
  Campaigns,
  CharacterAbilities,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelAbilityIncreases,
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

/**
 * The character's own rows (`CharacterRows`), read through `database` in its ruleset's scope, so their references are
 * the view's: its seat in a campaign, its ability scores, languages, inventory and levels, every saved level's ability
 * increases and picks, and the modifiers set on the character, then their requirements.
 */
async function readCharacterRows(database: Db, character: Character): Promise<CharacterRows> {
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
    abilityIncreases: await CharacterLevelAbilityIncreases.findMany(database, { characterLevelIds }),
    skills: await CharacterLevelSkills.findMany(database, { characterLevelIds }),
    feats: await CharacterLevelFeats.findMany(database, { characterLevelIds }),
    powers: await CharacterLevelPowers.findMany(database, { characterLevelIds }),
  };
  const modifiers = await Modifiers.findMany(database, { sourceIds: [characterId] });
  const requirements = await Requirements.findMany(database, { entityIds: modifiers.map((modifier) => modifier.id) });
  return { player, campaign, abilities, languages, inventory, levels, picks, modifiers, requirements };
}

/**
 * A master's bonded creatures, each with its rows and the master's (`master`), read in the master's ruleset's scope:
 * those `visibility` shows (a sheet shows an archived master's, which are archived with it).
 */
export async function readBondedInputs(
  database: Db,
  master: CharacterInput,
  visibility: Visibility = Visibility.UnarchivedOnly,
): Promise<CharacterInput[]> {
  const inputs: CharacterInput[] = [];
  for (const record of await Characters.findMany(database, { parentCharacterId: master.record.id }, visibility))
    inputs.push({ master, record, rows: await readCharacterRows(database, record) });
  return inputs;
}

/**
 * A character's row and its rows, read in its ruleset's scope: what the engine builds it from. A bonded creature's
 * comes with its master's, archived too, whose sheet the creature's derives from.
 */
export async function readCharacterInput(database: Db, record: Character): Promise<CharacterInput> {
  const rows = await readCharacterRows(database, record);
  if (!record.parentCharacterId) return { record, rows };
  const master = await Characters.findOne(database, { id: record.parentCharacterId }, Visibility.All);
  if (!master) throw new Error(`Bonded's master not found: ${record.parentCharacterId}`);
  return { master: await readCharacterInput(database, master), record, rows };
}
