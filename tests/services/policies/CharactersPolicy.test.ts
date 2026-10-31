import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A child of `parentId` (3.5's bonded creature): a kind no player character has, owned by its parent's owner. */
async function createChild(userId: string, parentId: string) {
  return await createTestCharacter(userId, { kind: "child", parentCharacterId: parentId });
}

/** A character of a new user's, with that user's session and a stranger's. */
async function setup() {
  const { user, session: owner } = await createTestUser();
  const { user: stranger, session: other } = await createTestUser();
  return { character: await createTestCharacter(user.id), owner, other, user, stranger };
}

describe("CharactersPolicy", () => {
  test("isReadable: its editors, a child's parent's", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).isReadable()).toBe(true);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).isReadable()).toBe(true);
    expect(new CharactersPolicy(other, character).isReadable()).toBe(false);

    const child = await createChild(character.userId, character.id);
    expect(new CharactersPolicy(other, child, { isParentEditor: true }).isReadable()).toBe(true);
    // Owning a child's row gives nothing of its own: its parent's editors read it
    expect(new CharactersPolicy(owner, child).isReadable()).toBe(false);
  });

  test("for: a contributor's rights come from their active role, a child's from its parent's", async () => {
    const { character, owner, other, user, stranger } = await setup();
    const child = await createChild(user.id, character.id);
    expect((await CharactersPolicy.for(db, other, character)).isReadable()).toBe(false);
    expect((await CharactersPolicy.for(db, other, child)).isReadable()).toBe(false);
    expect((await CharactersPolicy.for(db, owner, child)).isReadable()).toBe(true);

    await addCharacterContributor(character.id, stranger, user.id);
    expect((await CharactersPolicy.for(db, other, character)).isActiveContributor).toBe(true);
    expect((await CharactersPolicy.for(db, other, child)).isReadable()).toBe(true);
  });

  test("forMany: each of a page's policies as its for builds it, its contributions read at once", async () => {
    const { character, owner, other, user, stranger } = await setup();
    const child = await createChild(user.id, character.id);
    const page = [character, child];
    // Whether the session edits and reads each of the page's characters, by forMany and by for
    const standings = async (session: Pick<Session, "userId">) => {
      const policies = await CharactersPolicy.forMany(db, session, page);
      const many = page.map((entity) => [policies.get(entity.id)?.isEditor(), policies.get(entity.id)?.isReadable()]);
      const one = [];
      for (const entity of page) {
        const policy = await CharactersPolicy.for(db, session, entity);
        one.push([policy.isEditor(), policy.isReadable()]);
      }
      expect(many).toEqual(one);
      return many;
    };
    // Its owner edits it and reads its child; a stranger neither, until it contributes
    expect(await standings(owner)).toEqual([
      [true, true],
      [false, true],
    ]);
    expect(await standings(other)).toEqual([
      [false, false],
      [false, false],
    ]);
    await addCharacterContributor(character.id, stranger, user.id);
    expect(await standings(other)).toEqual([
      [true, true],
      [false, true],
    ]);
  });

  test("canArchive, canShare and canLink: a player character's owner; anyone else as an unknown character", async () => {
    const { character, owner, other } = await setup();
    const child = await createChild(character.userId, character.id);
    const contributor = new CharactersPolicy(other, character, { isActiveContributor: true });
    for (const check of ["canArchive", "canLink", "canShare"] as const) {
      expect(new CharactersPolicy(owner, character)[check]()).toBe(true);
      expect(() => contributor[check]()).toThrow(new NotFoundError("Character not found"));
      expect(() => new CharactersPolicy(owner, child, { isParentEditor: true })[check]()).toThrow(NotFoundError);
    }

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(new CharactersPolicy(owner, archived).canArchive()).toBe(true);
    expect(() => new CharactersPolicy(owner, archived).canShare()).toThrow(NotFoundError);
  });

  test("canReadContributors: a player character's readers; anyone else as an unknown character", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).canReadContributors()).toBe(true);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).canReadContributors()).toBe(true);
    expect(() => new CharactersPolicy(other, character).canReadContributors()).toThrow(
      new NotFoundError("Character not found"),
    );

    const child = await createChild(character.userId, character.id);
    expect(() => new CharactersPolicy(owner, child, { isParentEditor: true }).canReadContributors()).toThrow(
      NotFoundError,
    );
  });

  test("canManageContributors: the owner; a contributor is forbidden, anyone else answered as unknown", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).canManageContributors()).toBe(true);
    expect(() => new CharactersPolicy(other, character, { isActiveContributor: true }).canManageContributors()).toThrow(
      ForbiddenError,
    );
    expect(() => new CharactersPolicy(other, character).canManageContributors()).toThrow(NotFoundError);
  });

  test("canInviteContributors: managing them, on a character that isn't archived", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).canInviteContributors()).toBe(true);
    expect(() => new CharactersPolicy(other, character).canInviteContributors()).toThrow(NotFoundError);

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(() => new CharactersPolicy(owner, archived).canInviteContributors()).toThrow(
      new ConflictError("Cannot invite a contributor to an archived character"),
    );
  });

  test("isEditable and isPortraitEditable: its readers while it isn't archived; a player character's portrait, its owner", async () => {
    const { character, owner, other } = await setup();
    const contributor = new CharactersPolicy(other, character, { isActiveContributor: true });
    expect(new CharactersPolicy(owner, character).isPortraitEditable()).toBe(true);
    expect(contributor.isEditable()).toBe(true);
    expect(contributor.isPortraitEditable()).toBe(false);
    expect(new CharactersPolicy(other, character).isEditable()).toBe(false);

    const child = await createChild(character.userId, character.id);
    expect(new CharactersPolicy(other, child, { isParentEditor: true }).isPortraitEditable()).toBe(true);

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(new CharactersPolicy(owner, archived).isEditable()).toBe(false);
    expect(new CharactersPolicy(owner, archived).isPortraitEditable()).toBe(false);
  });

  test("a live child under an archived parent is read-only, as its parent is", async () => {
    const { character, owner, user } = await setup();
    // Archiving the parent archives its children: a live one under it is left as if it hadn't been
    await Characters.archive(db, { id: character.id });
    const child = await createChild(user.id, character.id);

    const policy = await CharactersPolicy.for(db, owner, child);
    expect(policy.isReadable()).toBe(true);
    expect(policy.isEditable()).toBe(false);
    expect(policy.isPortraitEditable()).toBe(false);
  });

  test("isEditor: a player character's owner and active contributors, archived or not; a child has none", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).isEditor()).toBe(true);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).isEditor()).toBe(true);
    expect(new CharactersPolicy(other, character).isEditor()).toBe(false);

    const child = await createChild(character.userId, character.id);
    expect(new CharactersPolicy(owner, child, { isParentEditor: true }).isEditor()).toBe(false);

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(new CharactersPolicy(owner, archived).isEditor()).toBe(true);
  });

  test("canHardDelete: the owner, once archived and out of any active campaign", async () => {
    const { character, owner, other } = await setup();
    expect(() => new CharactersPolicy(owner, character).canHardDelete({ inActiveCampaign: false })).toThrow(
      UnprocessableEntityError,
    );

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(() => new CharactersPolicy(other, archived).canHardDelete({ inActiveCampaign: false })).toThrow(
      NotFoundError,
    );
    expect(new CharactersPolicy(owner, archived).canHardDelete({ inActiveCampaign: false })).toBe(true);
    expect(() => new CharactersPolicy(owner, archived).canHardDelete({ inActiveCampaign: true })).toThrow(
      ConflictError,
    );
  });
});
