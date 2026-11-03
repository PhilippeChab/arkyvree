import type { Db } from "@/drizzle/database.ts";
import { type SharedRulesetScope, withSharedRulesetScope } from "@/server/cow/index.ts";
import { withWrite } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { CharacterContributors, Characters, Locks, Visibility } from "@/server/repositories/index.ts";
import { getEditableCharacter, getRowEditableCharacter } from "@/server/services/characters/index.ts";
import { CharactersPolicy, type RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { assertAccountStill, lockAccount, type NamedAccount } from "./userWrites.ts";

/**
 * The account a write of a character's own row makes rows for, locked shared before it (`account`: an invite's
 * invitee), and what an unknown character answers (`notFound`: what the write names, a contributor's own 404 under an
 * unknown character's path).
 */
interface CharacterLockOptions {
  account?: NamedAccount;
  notFound?: string;
}

/**
 * Who may make a character's write that reads its ruleset (`access`): who edits its own rows, or who edits it, a
 * child's parent's editors too.
 */
interface CharacterWriteOptions {
  access?: CharacterAccess;
}

/**
 * The policy's check a character's write asks: editing its own rows (`canEditRows`, `getRowEditableCharacter`), or
 * editing it (`canEdit`, `getEditableCharacter`), a child's through its parent.
 */
type CharacterAccess = "canEdit" | "canEditRows";

/** What an unknown invite to contribute to a character answers: it doesn't reveal whether it exists. */
const INVITE_NOT_FOUND = "Contributor invite not found";

/** What a write that gave up on a lock answers: another save held the character or its ruleset. */
export const BUSY_CHARACTER_MESSAGE = "The character is being changed by another save; try again";

/** The character the session may make a write of (`access`), under its lock, or the 404 an unknown one gets. */
async function findWritable(tx: Db, session: Session, characterId: string, access: CharacterAccess) {
  if (access === "canEditRows") return await getRowEditableCharacter(tx, session, characterId);
  return await getEditableCharacter(tx, session, characterId);
}

/**
 * Locks a character's row (`character`, as read before its lock: a child's parent never changes) until the transaction
 * ends, a child's (3.5's bonded creature's) parent's first: a write of the parent writes its children after locking it
 * (an advancement save's, an archive's), and a write of a child touches its parent (its last change, the database's
 * `touch_masters`), so masters go first, as the database's own writes take them. Whether the character's row is still
 * there, archived or not: an archived one is its policy's to refuse, on its state or as another record.
 */
async function lockCharacter(tx: Db, character: Pick<Character, "id" | "parentCharacterId">) {
  const ids = character.parentCharacterId ? [character.parentCharacterId, character.id] : [character.id];
  const locked = await Locks.lockCharacters(tx, { ids }, "no key update");
  return locked.some((row) => row.id === character.id);
}

/**
 * Runs a write of a character's own row (`characterId`) in its transaction: the account it makes rows for locked shared
 * first (`account`), then the character's row, archived or not (`lockCharacter`), then the row read again under its
 * lock, as the writes before it left it (archived since, renamed), and the session's policy on it, handed on with it.
 * An unknown one, or one gone by its lock, is refused as not found (`notFound`).
 */
async function writeLockedCharacter<T>(
  tx: Db,
  session: Session,
  characterId: string,
  write: (tx: Db, policy: CharactersPolicy, character: Character) => Promise<T>,
  { account, notFound = "Character not found" }: CharacterLockOptions,
): Promise<T> {
  const accountId = account && (await lockAccount(tx, account));
  const located = await Characters.findOne(tx, { id: characterId }, Visibility.All);
  // Archived or not: whether it's still there, the read under its lock answers
  if (located) await lockCharacter(tx, located);
  // Read again under its lock, as the writes it waited for left it: one deleted meanwhile is not found either
  const character = located && (await Characters.findOne(tx, { id: characterId }, Visibility.All));
  if (!character) throw new NotFoundError(notFound);
  if (account) await assertAccountStill(tx, account, accountId);
  return await write(tx, await CharactersPolicy.for(tx, session, character), character);
}

/**
 * Locks the character a write names by its id (`characterId`: a campaign's link, a portrait's attachment), archived or
 * not, as `lockCharacter` locks it, its master's row first: an unknown one, or one gone by its lock, is refused as not
 * found; an archived one is locked too, which its policy refuses.
 */
export async function lockNamedCharacter(tx: Db, characterId: string) {
  const character = await Characters.findOne(tx, { id: characterId }, Visibility.All);
  if (!character || !(await lockCharacter(tx, character))) throw new NotFoundError("Character not found");
}

/**
 * Runs the creation of a character in a ruleset (`rulesetId`: a new one, an import), which reads its view: its
 * owner's account (the session's) locked shared first (`lockAccount`), so an account's deletion waits for it or is
 * seen by it, then the ruleset's row and its source chain's locked shared (`withSharedRulesetScope`), then the session's policy on the
 * ruleset, if it may read it (`getReadableRuleset`, the 404 an unknown ruleset gets otherwise), then its view, fresh.
 */
export async function withCharacterCreate<T>(
  session: Session,
  rulesetId: string,
  write: (tx: Db, scope: SharedRulesetScope, policy: RulesetsPolicy) => Promise<T>,
): Promise<T> {
  return await withWrite(async (tx) => {
    await lockAccount(tx, { userId: session.userId });
    return await withSharedRulesetScope(tx, rulesetId, async (scope, policy) => write(tx, scope, policy), {
      before: async () => (await getReadableRuleset(tx, session, rulesetId)).policy,
    });
  }, BUSY_CHARACTER_MESSAGE);
}

/**
 * Runs a write of a character that reads its ruleset's view (`characterId`: its advancements, its edit, its scores, its
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
  { access = "canEditRows" }: CharacterWriteOptions = {},
): Promise<T> {
  return await withWrite(async (tx) => {
    // Archived or not: an archived one is its policy's to refuse, as a refusal on its state
    const located = await Characters.findOne(tx, { id: characterId }, Visibility.All);
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
  }, BUSY_CHARACTER_MESSAGE);
}

/**
 * Runs a write of a character's contributor invite (`contributorId`: its answer) under its character's lock, as
 * `withLockedCharacter` runs one, by an invitee who may not read the character yet: an unknown invite refused as one
 * the session can't see (`INVITE_NOT_FOUND`), and its character's policy handed on, which decides the rest. An
 * invite's character never changes, so it's read before the lock. An acceptance locks its invitee's account shared
 * first (`account`), so it waits for that account's deletion, and never turns back the row the deletion ended.
 */
export async function withInviteCharacter<T>(
  session: Session,
  contributorId: string,
  write: (tx: Db, policy: CharactersPolicy, character: Character) => Promise<T>,
  { account }: Pick<CharacterLockOptions, "account"> = {},
): Promise<T> {
  return await withWrite(async (tx) => {
    const contributor = await CharacterContributors.findOne(tx, { id: contributorId });
    if (!contributor) throw new NotFoundError(INVITE_NOT_FOUND);
    return await writeLockedCharacter(tx, session, contributor.characterId, write, {
      account,
      notFound: INVITE_NOT_FOUND,
    });
  }, BUSY_CHARACTER_MESSAGE);
}

/**
 * Runs a write of a character that reads none of its ruleset (`characterId`: its own columns alone, its archive, its
 * contributors, its share link, an item's or a modifier's removal), which decides the session's rights on the policy
 * it's handed: the row locked first (`writeLockedCharacter`), archived or not, so its writes take turns, then read
 * again under its lock, and the session's policy on it, whose checks refuse whoever may not make the write and the
 * wrong state (an archived one's share link, a live one's permanent delete). An unknown one is refused as not found.
 * The account it makes rows for (`account`: an invite's invitee) is locked shared first. A write that waited past the
 * lock wait is refused as a conflict (`BUSY_CHARACTER_MESSAGE`).
 */
export async function withLockedCharacter<T>(
  session: Session,
  characterId: string,
  write: (tx: Db, policy: CharactersPolicy, character: Character) => Promise<T>,
  options: CharacterLockOptions = {},
): Promise<T> {
  return await withWrite(
    async (tx) => await writeLockedCharacter(tx, session, characterId, write, options),
    BUSY_CHARACTER_MESSAGE,
  );
}
