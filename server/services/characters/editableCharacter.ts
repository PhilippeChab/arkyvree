import type { CharacterInput } from "@/engine/index.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { type Db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

import { readCharacterInput } from "./characterInputs.ts";

export async function findEditableCharacterOrBonded(tx: Db, characterId: string, userId: string) {
  const pc = await Characters.findOne(tx, { id: characterId, editorId: userId });
  if (pc) return pc;
  const bonded = await Characters.findOne(tx, { id: characterId });
  if (!bonded || bonded.kind === "pc" || !bonded.parentCharacterId) return null;
  const master = await Characters.findOne(tx, {
    id: bonded.parentCharacterId,
    editorId: userId,
  });
  return master ? bonded : null;
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
