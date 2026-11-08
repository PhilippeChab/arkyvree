import type { Db } from "@/drizzle/database.ts";
import type { CharacterInput } from "@/engine/index.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

import { readCharacterInput } from "./characterInputs.ts";

/**
 * The character `characterId`, archived or not, and the session's policy on it, whose check the guards below ask: an
 * unknown one gets the 404 the policy's checks answer whoever may not read it, so its existence isn't revealed.
 */
async function getCharacterPolicy(db: Db, session: Session, characterId: string) {
  const character = await Characters.findOne(db, { id: characterId }, Visibility.All);
  if (!character) throw new NotFoundError("Character not found");
  return { character, policy: await CharactersPolicy.for(db, session, character) };
}

/**
 * The character `characterId`, archived or not, and the session's policy on it, if the session may read it
 * (`CharactersPolicy.isReadable`), or none, as for a character that doesn't exist: what reads a character by its id,
 * or by what's under it, and what links to one, ask, so its existence isn't revealed.
 */
export async function findReadableCharacter(db: Db, session: Session, characterId: string) {
  const character = await Characters.findOne(db, { id: characterId }, Visibility.All);
  if (!character) return undefined;
  const policy = await CharactersPolicy.for(db, session, character);
  return policy.isReadable() ? { character, policy } : undefined;
}

/**
 * The character `characterId`, archived or not, once the session may edit it (`CharactersPolicy.canEdit`): a player
 * character they own, actively contribute to or run the live campaign of, or a child (3.5's bonded creature) of one.
 * Anyone else gets the 404 an unknown character gets, and an archived one, or a child of one, the policy's refusal on
 * its state (a 409). A player character is edited by its own editors alone, never through a parent.
 */
export async function getEditableCharacter(db: Db, session: Session, characterId: string) {
  const { character, policy } = await getCharacterPolicy(db, session, characterId);
  policy.canEdit();
  return character;
}

/**
 * The character `characterId`, archived or not, once the session may change its portrait
 * (`CharactersPolicy.canEditPortrait`): a player character's owner, a child's editors. Anyone else gets its policy's
 * refusal: the 404 an unknown character gets, a 403 for a reader who may not, a 409 for an archived one.
 */
export async function getPortraitEditableCharacter(db: Db, session: Session, characterId: string) {
  const { character, policy } = await getCharacterPolicy(db, session, characterId);
  policy.canEditPortrait();
  return character;
}

/**
 * The player character `characterId`, archived or not, once the session may edit its own rows
 * (`CharactersPolicy.canEditRows`: they own it, contribute to it or run its live campaign, while it isn't archived):
 * anyone else gets the 404 an unknown character gets (a child's are its parent's), and an archived one's editors the
 * policy's refusal on its state (a 409).
 */
export async function getRowEditableCharacter(db: Db, session: Session, characterId: string) {
  const { character, policy } = await getCharacterPolicy(db, session, characterId);
  policy.canEditRows();
  return character;
}

/**
 * The player character `characterId`, archived or not, whose sheet stays readable, once the session may read its own
 * rows (`CharactersPolicy.canReadRows`: its editors): anyone else gets the 404 an unknown character gets.
 */
export async function getRowReadableCharacter(db: Db, session: Session, characterId: string) {
  const { character, policy } = await getCharacterPolicy(db, session, characterId);
  policy.canReadRows();
  return character;
}

/**
 * Runs `run` in the ruleset scope of the character whose own rows the session may edit (`getRowEditableCharacter`),
 * with the character's rows: what an advancement's reads ask the engine with.
 */
export async function withRowEditableCharacter<T>(
  database: Db,
  session: Session,
  characterId: string,
  run: (scope: RulesetScope, character: CharacterInput) => T,
): Promise<Awaited<T>> {
  const characterRecord = await getRowEditableCharacter(database, session, characterId);
  return await withRulesetScope(
    database,
    characterRecord.rulesetId,
    async (scope) => await run(scope, await readCharacterInput(database, characterRecord)),
  );
}
