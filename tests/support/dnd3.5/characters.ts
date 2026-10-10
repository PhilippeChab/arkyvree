import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
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
