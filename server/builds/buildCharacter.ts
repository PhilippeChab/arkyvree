import type { PreloadedCharacterData } from "@/engine/core/types.ts";
import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/engine/types.ts";
import type { Character } from "@/shared/relations.ts";

/** What a module makes a character with: the one part of its contract a build needs. */
interface CharacterFactory<C extends DetailedCharacterInterface, K extends string> {
  createDetailedCharacter(record: Character, kind?: K): C;
}

/**
 * A character, built: made by its ruleset's module (`module`, whose type its character keeps), of its `kind` (a bonded
 * creature's), with a level-up's `projected` levels and picks, in `scope` when the caller holds the character's ruleset's
 * (or a `preload()`'s shared rows), read through `database` (a transaction's, to see what it wrote). The one way the
 * server builds a character.
 */
export async function buildCharacter<C extends DetailedCharacterInterface, K extends string>(
  module: CharacterFactory<C, K>,
  record: Character,
  {
    database,
    kind,
    projected,
    scope,
  }: { database?: Db; kind?: K; projected?: unknown; scope?: RulesetScope | PreloadedCharacterData } = {},
): Promise<C> {
  const character = module.createDetailedCharacter(record, kind);
  await character.build(database, projected, scope);
  return character;
}
