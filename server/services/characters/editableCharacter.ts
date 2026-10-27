import type { Db } from "@/drizzle/database.ts";
import type { CharacterInput } from "@/engine/index.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

import { readCharacterInput } from "./characterInputs.ts";

/**
 * The character `characterId` if the user may edit it (`CharactersPolicy.isEditable`, while neither it nor a child's
 * parent is archived): a player character they own or actively contribute to, or a child (3.5's bonded creature) of
 * one; null otherwise. A player character is edited by its own editors alone, never through a parent.
 */
export async function findEditableCharacterOrChild(db: Db, characterId: string, userId: string) {
  const character = await Characters.findOne(db, { id: characterId });
  if (!character) return null;
  return (await CharactersPolicy.for(db, { userId }, character)).isEditable() ? character : null;
}

/**
 * The player character whose own rows the session's user may edit (`CharactersPolicy.isEditor`: they own it or
 * contribute to it), or a 404: a child's are its parent's. It's looked up unarchived; `Visibility.All` finds an archived
 * one too, whose sheet stays readable.
 */
export async function getEditableCharacter(
  db: Db,
  session: Session,
  characterId: string,
  visibility: Visibility = Visibility.UnarchivedOnly,
) {
  const character = await Characters.findOne(db, { id: characterId }, visibility);
  if (!character || !(await CharactersPolicy.for(db, session, character)).isEditor())
    throw new NotFoundError("Character not found");
  return character;
}

/**
 * Runs `run` in the ruleset scope of the character the session may edit, with the character's rows: what a level-up's
 * reads ask the engine with.
 */
export async function withEditableCharacter<T>(
  database: Db,
  session: Session,
  characterId: string,
  run: (scope: RulesetScope, character: CharacterInput) => T,
): Promise<Awaited<T>> {
  const characterRecord = await getEditableCharacter(database, session, characterId);
  return await withRulesetScope(
    database,
    characterRecord.rulesetId,
    async (scope) => await run(scope, await readCharacterInput(database, characterRecord)),
  );
}
