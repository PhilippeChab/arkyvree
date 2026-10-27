import type { Db } from "@/drizzle/database.ts";
import type { CharacterInput, CharacterRows } from "@/engine/index.ts";
import {
  CharacterAdvancements,
  CharacterInventory,
  CharacterLinks,
  Characters,
  Modifiers,
  Picks,
  Requirements,
  Visibility,
} from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * The character's own rows (`CharacterRows`), read as stored through `database`: its links of each role it holds many
 * of, its inventory, its advancements and their picks by step, and the modifiers set on the character, then their
 * requirements.
 */
async function readCharacterRows(database: Db, character: Character): Promise<CharacterRows> {
  const characterId = character.id;
  const links = await CharacterLinks.findPerRole(database, { characterId });
  const inventory = await CharacterInventory.findMany(database, { characterId });
  const advancements = await CharacterAdvancements.findMany(database, { characterId });
  const picks = await Picks.findPerStep(database, { advancementIds: advancements.map(({ id }) => id) });
  const modifiers = await Modifiers.findMany(database, { sourceIds: [characterId] });
  const requirements = await Requirements.findMany(database, { entityIds: modifiers.map((modifier) => modifier.id) });
  return { links, inventory, advancements, picks, modifiers, requirements };
}

/**
 * A character's row and its rows, read in its ruleset's scope: what the engine builds it from. A child's comes with its
 * parent's, archived too, whose sheet the child's derives from.
 */
export async function readCharacterInput(database: Db, record: Character): Promise<CharacterInput> {
  const rows = await readCharacterRows(database, record);
  if (!record.parentCharacterId) return { record, rows };
  const parent = await Characters.findOne(database, { id: record.parentCharacterId }, Visibility.All);
  if (!parent) throw new Error(`A child's parent not found: ${record.parentCharacterId}`);
  return { parent: await readCharacterInput(database, parent), record, rows };
}

/**
 * A character's children (3.5's bonded creatures), each with its rows and its parent's (`parent`), read in the parent's
 * ruleset's scope: those `visibility` shows (a sheet shows an archived parent's, which are archived with it).
 */
export async function readChildInputs(
  database: Db,
  parent: CharacterInput,
  visibility: Visibility = Visibility.UnarchivedOnly,
): Promise<CharacterInput[]> {
  const inputs: CharacterInput[] = [];
  for (const record of await Characters.findMany(database, { parentCharacterId: parent.record.id }, visibility))
    inputs.push({ parent, record, rows: await readCharacterRows(database, record) });
  return inputs;
}
