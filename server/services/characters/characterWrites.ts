import type { Db } from "@/drizzle/database.ts";
import { type SharedRulesetScope, withSharedRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getReadableRuleset, withBoundedWrite } from "@/server/services/rulesets/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { findEditableCharacterOrChild, getEditableCharacter } from "./editableCharacter.ts";

/** Which of a character's rows a write of its own row alone finds (`visibility`), and what an unknown one answers. */
interface CharacterLockOptions {
  notFound?: string;
  visibility?: Visibility;
}

/** Who may make a character's write that reads its ruleset (`access`): its own editors, or a child's parent's too. */
interface CharacterWriteOptions {
  access?: CharacterAccess;
}

/** Who may make a character's write: its own editors (`getEditableCharacter`), or a child's parent's too. */
type CharacterAccess = "editor" | "editorOrChild";

/** What a write that gave up on a lock answers: another save held the character or its ruleset. */
export const BUSY_CHARACTER_MESSAGE = "The character is being changed by another save; try again";

/** The character the session may make a write of (`access`), under its lock, or the 404 an unknown one gets. */
async function findWritable(tx: Db, session: Session, characterId: string, access: CharacterAccess) {
  if (access === "editor") return await getEditableCharacter(tx, session, characterId);
  const character = await findEditableCharacterOrChild(tx, characterId, session.userId);
  if (!character) throw new NotFoundError("Character not found");
  return character;
}

/**
 * Locks a character's row (`character`, as read before its lock: a child's parent never changes) until the transaction
 * ends, a child's (3.5's bonded creature's) parent's first: a write of the parent writes its children after locking it
 * (a level save's, an archive's), and a write of a child touches its parent (its last change, the database's
 * `touch_masters`), so masters go first, as the database's own writes take them. Whether the character's row is there
 * (`visibility`).
 */
async function lockCharacter(
  tx: Db,
  character: Pick<Character, "id" | "parentCharacterId">,
  visibility: Visibility = Visibility.UnarchivedOnly,
) {
  if (character.parentCharacterId)
    await Characters.lock(tx, { id: character.parentCharacterId, visibility: Visibility.All }, "no key update");
  return await Characters.lock(tx, { id: character.id, visibility }, "no key update");
}

/**
 * Runs the creation of a character in a ruleset (`rulesetId`: a new one, an import), which reads its view: the
 * ruleset's row and its source chain's locked shared (`withSharedRulesetScope`), then the session's policy on the
 * ruleset, if it may read it (`getReadableRuleset`, the 404 an unknown ruleset gets otherwise), then its view, fresh.
 */
export async function withCharacterCreate<T>(
  session: Session,
  rulesetId: string,
  write: (tx: Db, scope: SharedRulesetScope, policy: RulesetsPolicy) => Promise<T>,
): Promise<T> {
  return await withBoundedWrite(BUSY_CHARACTER_MESSAGE, async (tx) =>
    withSharedRulesetScope(tx, rulesetId, async (scope, policy) => write(tx, scope, policy), {
      before: async () => (await getReadableRuleset(tx, session, rulesetId)).policy,
    }),
  );
}

/**
 * Runs a write of a character that reads none of its ruleset (`characterId`: its own columns alone, its archive, its
 * contributors, its share link, an item's or a modifier's removal), and decides the session's rights itself: the row
 * locked first (`visibility`: an archived one too, for its unarchive or its delete), so its writes take turns, an
 * unknown one refused as not found (`notFound`: what the write names, a contributor's own 404 under an unknown
 * character's path). A write that waited past the lock wait is refused as a conflict (`BUSY_CHARACTER_MESSAGE`).
 */
export async function withCharacterLock<T>(
  characterId: string,
  write: (tx: Db) => Promise<T>,
  { notFound = "Character not found", visibility = Visibility.UnarchivedOnly }: CharacterLockOptions = {},
): Promise<T> {
  return await withBoundedWrite(BUSY_CHARACTER_MESSAGE, async (tx) => {
    const located = await Characters.findOne(tx, { id: characterId }, visibility);
    if (!located || !(await lockCharacter(tx, located, visibility))) throw new NotFoundError(notFound);
    return await write(tx);
  });
}

/**
 * Runs a write of a character that reads its ruleset's view (`characterId`: its levels, its edit, its scores, its
 * inventory, its modifiers), the one way such a write opens its transaction: its ruleset's row and its source chain's
 * locked shared (`withSharedRulesetScope`), so no write of theirs runs meanwhile while other characters' writes run
 * alongside, then the character's row (its writes take turns), then the session's access (`access`), then its view,
 * fresh under them: a ruleset's write locks its own row before its chain's, and a character's write after them, so
 * the two never wait on each other in a cycle; a child's parent's row is locked before the child's (`lockCharacter`).
 * A write that waited past the lock wait, or deadlocked, is refused as a conflict (`BUSY_CHARACTER_MESSAGE`), changing
 * nothing. A character's ruleset never changes, so it's read before the locks.
 */
export async function withCharacterWrite<T>(
  session: Session,
  characterId: string,
  write: (tx: Db, scope: SharedRulesetScope, character: Character) => Promise<T>,
  { access = "editor" }: CharacterWriteOptions = {},
): Promise<T> {
  return await withBoundedWrite(BUSY_CHARACTER_MESSAGE, async (tx) => {
    const located = await Characters.findOne(tx, { id: characterId });
    if (!located) throw new NotFoundError("Character not found");
    return await withSharedRulesetScope(
      tx,
      located.rulesetId,
      async (scope, character) => write(tx, scope, character),
      {
        before: async () => {
          if (!(await lockCharacter(tx, located))) throw new NotFoundError("Character not found");
          return await findWritable(tx, session, characterId, access);
        },
      },
    );
  });
}
