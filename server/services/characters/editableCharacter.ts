import type { Db } from "@/drizzle/database.ts";
import { type CharacterInput, Engine } from "@/engine/index.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

import { readCharacterInput } from "./characterInputs.ts";

/**
 * The character `characterId` if the user may edit it (`userId`: they own it or actively contribute to it), or if it's a
 * child (3.5's bonded creature) whose parent they may edit; null otherwise. A player character is edited by its own
 * editors alone, never through a parent. `Visibility.All` finds an archived one too, and an archived parent's child,
 * whose sheets stay readable.
 */
export async function findEditableCharacterOrChild(
  db: Db,
  characterId: string,
  userId: string,
  visibility: Visibility = Visibility.UnarchivedOnly,
) {
  const character = await Characters.findOne(db, { id: characterId }, visibility);
  if (!character) return null;
  const parentId = Engine.storage().isPlayerKind(character.kind) ? undefined : character.parentCharacterId;
  // A child through its parent; `editorId` finds a player character alone, so a child with no parent has no editor
  const editable = await Characters.findOne(db, { id: parentId ?? character.id, editorId: userId }, visibility);
  return editable ? character : null;
}

/**
 * The character the session's user may edit (they own it or contribute to it), or a 404. `Visibility.All` finds an
 * archived one too, whose sheet stays readable.
 */
export async function getEditableCharacter(
  db: Db,
  session: Session,
  characterId: string,
  visibility: Visibility = Visibility.UnarchivedOnly,
) {
  const character = await Characters.findOne(db, { id: characterId, editorId: session.userId }, visibility);
  if (!character) throw new NotFoundError("Character not found");
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
