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
  Modifiers,
  PlayerCharacters,
  Players,
  Requirements,
} from "@/server/repositories/index.ts";
import type { CharacterRows } from "@/server/rulesets/engine/types.ts";
import type { Character } from "@/shared/relations.ts";

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
