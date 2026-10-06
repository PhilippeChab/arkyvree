import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import { addCharacterContributor, createTestCharacter, createTestUser } from "@/tests/helpers.ts";

/** A character of a new user's, with that user's session and a stranger's. */
async function setup() {
  const { user, session: owner } = await createTestUser();
  const { user: stranger, session: other } = await createTestUser();
  return { character: await createTestCharacter(user.id), owner, other, user, stranger };
}

describe("CharactersPolicy", () => {
  test("canManageContributors: the owner only", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).canManageContributors()).toBe(true);
    expect(() => new CharactersPolicy(other, character, true).canManageContributors()).toThrow(ForbiddenError);
  });

  test("canReadContributors: the owner and active contributors", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).canReadContributors()).toBe(true);
    expect(new CharactersPolicy(other, character, true).canReadContributors()).toBe(true);
    expect(() => new CharactersPolicy(other, character).canReadContributors()).toThrow(ForbiddenError);
  });

  test("for: a contributor's rights come from their active role", async () => {
    const { character, other, user, stranger } = await setup();
    expect(() => new CharactersPolicy(other, character).canReadContributors()).toThrow(ForbiddenError);
    await addCharacterContributor(character.id, stranger, user.id);
    expect((await CharactersPolicy.for(db, other, character)).canReadContributors()).toBe(true);
  });

  test("canHardDelete: the owner, once archived and out of any active campaign", async () => {
    const { character, owner, other } = await setup();
    expect(() => new CharactersPolicy(owner, character).canHardDelete({ inActiveCampaign: false })).toThrow(
      UnprocessableEntityError,
    );

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(() => new CharactersPolicy(other, archived).canHardDelete({ inActiveCampaign: false })).toThrow(
      ForbiddenError,
    );
    expect(new CharactersPolicy(owner, archived).canHardDelete({ inActiveCampaign: false })).toBe(true);
    expect(() => new CharactersPolicy(owner, archived).canHardDelete({ inActiveCampaign: true })).toThrow(
      ConflictError,
    );
  });
});
