import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Campaigns, Characters, PlayerCharacters, Players } from "@/server/repositories/index.ts";
import CharactersPolicy from "@/server/services/policies/CharactersPolicy.ts";
import { createTestCharacter, createTestUser } from "@/tests/helpers.ts";

/** A character of a new user's, with that user's session and a stranger's. */
async function setup() {
  const { user, session: owner } = await createTestUser();
  const { session: other } = await createTestUser();
  return { character: await createTestCharacter(user.id), owner, other };
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

  test("canHardDelete: the owner, once archived and out of any active campaign", async () => {
    const { character, owner, other } = await setup();
    await expect(new CharactersPolicy(owner, character).canHardDelete()).rejects.toThrow(UnprocessableEntityError);

    const [archived] = await Characters.archive(db, { id: character.id });
    await expect(new CharactersPolicy(other, archived).canHardDelete()).rejects.toThrow(ForbiddenError);
    expect(await new CharactersPolicy(owner, archived).canHardDelete()).toBe(true);

    const [campaign] = await Campaigns.create(db, { name: "Active Campaign", rulesetId: character.rulesetId });
    const [player] = await Players.create(db, {
      campaignId: campaign.id,
      userId: owner.userId,
      role: "Player Character",
    });
    await PlayerCharacters.create(db, { playerId: player.id, characterId: character.id });
    await expect(new CharactersPolicy(owner, archived).canHardDelete()).rejects.toThrow(ConflictError);

    // An archived campaign no longer holds the character.
    await Campaigns.archive(db, { id: campaign.id });
    expect(await new CharactersPolicy(owner, archived).canHardDelete()).toBe(true);
  });
});
