import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { CharacterContributors } from "@/server/repositories/index.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const ALLOWED = "allowed";
const FORBIDDEN = "ForbiddenError: Not authorized to attach to this record";
const NOT_FOUND = "NotFoundError: Character not found";

/**
 * Who asks of which character, and what editing it (`updateCharacter`, as `getLinkPicks` and its PDF read it), reading
 * its sheet (`getCharacter`) and uploading its portrait answer.
 */
// oxfmt-ignore
const CASES = [
  ["its owner", "owner", "character", { edit: ALLOWED, read: ALLOWED, portrait: ALLOWED }],
  ["an active contributor", "contributor", "character", { edit: ALLOWED, read: ALLOWED, portrait: FORBIDDEN }],
  ["a pending contributor", "pending", "character", { edit: NOT_FOUND, read: NOT_FOUND, portrait: FORBIDDEN }],
  ["a stranger", "stranger", "character", { edit: NOT_FOUND, read: NOT_FOUND, portrait: FORBIDDEN }],
  ["an archived one's owner", "owner", "archived", { edit: NOT_FOUND, read: ALLOWED, portrait: FORBIDDEN }],
  ["an archived one's contributor", "contributor", "archived", { edit: NOT_FOUND, read: ALLOWED, portrait: FORBIDDEN }],
  ["an archived one's pending contributor", "pending", "archived", { edit: NOT_FOUND, read: NOT_FOUND, portrait: FORBIDDEN }],
  ["a child's parent's owner", "owner", "familiar", { edit: ALLOWED, read: ALLOWED, portrait: ALLOWED }],
  ["a child's parent's contributor", "contributor", "familiar", { edit: ALLOWED, read: ALLOWED, portrait: ALLOWED }],
  ["a child's parent's pending contributor", "pending", "familiar", { edit: NOT_FOUND, read: NOT_FOUND, portrait: FORBIDDEN }],
  ["a stranger to a child", "stranger", "familiar", { edit: NOT_FOUND, read: NOT_FOUND, portrait: FORBIDDEN }],
  ["an archived parent's child's owner", "owner", "archivedFamiliar", { edit: NOT_FOUND, read: ALLOWED, portrait: FORBIDDEN }],
  ["an archived parent's child's contributor", "contributor", "archivedFamiliar", { edit: NOT_FOUND, read: ALLOWED, portrait: FORBIDDEN }],
  ["a child with no parent's owner", "owner", "orphan", { edit: NOT_FOUND, read: NOT_FOUND, portrait: FORBIDDEN }],
  ["a player character stored with a parent: its owner", "other", "playerWithParent", { edit: ALLOWED, read: ALLOWED, portrait: ALLOWED }],
  ["a player character stored with a parent: the parent's owner", "owner", "playerWithParent", { edit: NOT_FOUND, read: NOT_FOUND, portrait: FORBIDDEN }],
  ["a missing character's", "owner", "missing", { edit: NOT_FOUND, read: NOT_FOUND, portrait: FORBIDDEN }],
] as const;

/** What a call answers: allowed, or its error's name and message. */
async function outcomeOf(call: () => Promise<unknown>) {
  try {
    await call();
    return ALLOWED;
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : error;
  }
}

/**
 * A player character with a familiar, its owner, an active and a pending contributor, and a stranger; an archived
 * character, which archived its familiar with it; a familiar stored with no parent; and a player character stored with
 * a parent, which no save writes, and which is never edited through it.
 */
async function setUp() {
  const { user: owner, session: ownerSession } = await createTestUser();
  const { user: contributor, session: contributorSession } = await createTestUser();
  const { user: pending, session: pendingSession } = await createTestUser();
  const { user: other, session: otherSession } = await createTestUser();
  const { session: strangerSession } = await createTestUser();

  const character = await createTestCharacter(owner.id);
  const familiar = await createTestCharacter(owner.id, { kind: "familiar", parentCharacterId: character.id });
  const archived = await createTestCharacter(owner.id);
  const archivedFamiliar = await createTestCharacter(owner.id, { kind: "familiar", parentCharacterId: archived.id });
  const orphan = await createTestCharacter(owner.id, { kind: "familiar" });
  const playerWithParent = await createTestCharacter(other.id, { parentCharacterId: character.id });

  for (const id of [character.id, archived.id]) {
    await addCharacterContributor(id, contributor, owner.id);
    const invite = { characterId: id, userId: pending.id, email: pending.emailAddress, role: "Editor" as const };
    await CharacterContributors.create(db, { ...invite, invitedBy: owner.id });
  }
  await CharactersService.archiveCharacter(ownerSession, archived.id);

  return {
    sessions: {
      owner: ownerSession,
      contributor: contributorSession,
      pending: pendingSession,
      other: otherSession,
      stranger: strangerSession,
    },
    characters: {
      character: character.id,
      familiar: familiar.id,
      archived: archived.id,
      archivedFamiliar: archivedFamiliar.id,
      orphan: orphan.id,
      playerWithParent: playerWithParent.id,
      missing: NIL_UUID,
    },
  };
}

describe("Who edits a character, or a child through its parent", () => {
  test.each(CASES)("%s", async (_name, who, what, expected) => {
    const { sessions, characters } = await setUp();
    const session = sessions[who];
    const id = characters[what];
    const upload = {
      recordType: "Character",
      recordId: id,
      name: "portrait",
      filename: "portrait.png",
      contentType: "image/png",
      byteSize: 2048,
    };

    expect({
      edit: await outcomeOf(() => CharactersService.updateCharacter(session, id, { name: "Renamed" })),
      read: await outcomeOf(() => CharactersService.getCharacter(session, id)),
      portrait: await outcomeOf(() => AttachmentsService.createDirectUpload(session, upload)),
    }).toEqual(expected);
  });
});
