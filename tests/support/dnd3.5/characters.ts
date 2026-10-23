import CharacterResponse from "@/engine/rulesets/dnd3.5/characters/description/CharacterResponse.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";
import { buildCharacter } from "@/tests/support/characters.ts";

/**
 * `record`, built as the engine builds it (`buildCharacter`), as the 3.5 class a test reads it as (`Kind`: a player
 * character, a familiar, a mount…): refused when its row's kind builds another.
 */
export async function buildAs<C extends DetailedCharacter>(
  Kind: new (record: Character) => C,
  record: Character,
  options?: Parameters<typeof buildCharacter>[1],
) {
  const character = await buildCharacter(record, options);
  if (!(character instanceof Kind) || character.constructor !== Kind)
    throw new Error(`${record.name} builds as a ${character.constructor.name}, not a ${Kind.name}`);
  return character;
}

/**
 * A 3.5 character's sheet (`characterId`'s, a bonded creature's built with its master), every part of it as its module
 * builds it (`CharacterResponse.buildSheet`): what its blocks show, as the rules hold it, which the API answers none of.
 */
export async function sheetOf(characterId: string) {
  const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
  if (!record) throw new Error(`No character ${characterId}`);
  const built = await buildCharacter(record);
  if (!(built instanceof DetailedCharacter)) throw new Error(`${record.name} doesn't build as a 3.5 character`);
  return CharacterResponse.buildBondedSheet(record, built);
}
