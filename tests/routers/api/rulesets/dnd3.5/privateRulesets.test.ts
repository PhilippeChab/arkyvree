import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Campaigns, Contributors, Players } from "@/server/repositories/index.ts";
import { type api, createSignedInUser, expectStatus } from "@/tests/support/api.ts";
import { addCharacterContributor, addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";

type Client = typeof api;

const HIDDEN = [404, 404, 404, 404];
const READ = [200, 200, 200, 200];

/** The status of a ruleset's main reads by its id, as `client` reads them: itself, its abilities, one, its Settings. */
async function readStatuses(client: Client, id: string): Promise<number[]> {
  const { abilityMap } = await getSeedCtx();
  const ruleset = client.api.rulesets[":id"];
  const abilities = ruleset.entities[":entityType"];
  const entityType = "abilities";
  return [
    (await ruleset.$get({ param: { id } })).status,
    (await abilities.$get({ param: { id, entityType }, query: {} })).status,
    (await abilities[":entityId"].$get({ param: { id, entityType, entityId: abilityMap["Strength"] } })).status,
    (await ruleset.settings.$get({ param: { id } })).status,
  ];
}

/** A campaign on the ruleset, archived when `archived` says so, with `userId` playing in it. */
async function seatPlayer(rulesetId: string, userId: string, archived = false) {
  const [campaign] = await Campaigns.create(db, {
    name: `Campaign ${uniqueId()}`,
    rulesetId,
    deletedAt: archived ? new Date().toISOString() : undefined,
  });
  await Players.create(db, { campaignId: campaign.id, userId, role: "Player Character" });
}

/** A private seeded fork, its owner, and a user who has no standing on it yet. */
async function setup() {
  const owner = await createSignedInUser("owner");
  const ruleset = await createSeededTestRuleset(owner.user.id, { private: true });
  const reader = await createSignedInUser("reader");
  return { owner, ruleset, reader };
}

describe("a private ruleset's reads by its id", () => {
  test("its owner reads it", async () => {
    const { owner, ruleset } = await setup();
    expect(await readStatuses(owner.api, ruleset.id)).toEqual(READ);
  });

  test("an active contributor reads it, whatever their role", async () => {
    const { owner, ruleset, reader } = await setup();
    await addRulesetContributor(ruleset.id, reader.user, owner.user.id, "Viewer");
    expect(await readStatuses(reader.api, ruleset.id)).toEqual(READ);
  });

  test("a pending or revoked contributor doesn't", async () => {
    const { owner, ruleset, reader } = await setup();
    const [invite] = await Contributors.create(db, {
      rulesetId: ruleset.id,
      userId: reader.user.id,
      email: reader.user.emailAddress,
      role: "Editor",
      invitedBy: owner.user.id,
    });
    expect(await readStatuses(reader.api, ruleset.id)).toEqual(HIDDEN);

    await Contributors.update(db, { status: "Revoked" }, { id: invite.id });
    expect(await readStatuses(reader.api, ruleset.id)).toEqual(HIDDEN);
  });

  test("a player in a campaign on it reads it, but not once the campaign is deleted", async () => {
    const { ruleset, reader } = await setup();
    const { user: exPlayer, api: exPlayerApi } = await createSignedInUser("ex-player");
    await seatPlayer(ruleset.id, reader.user.id);
    await seatPlayer(ruleset.id, exPlayer.id, true);

    expect(await readStatuses(reader.api, ruleset.id)).toEqual(READ);
    expect(await readStatuses(exPlayerApi, ruleset.id)).toEqual(HIDDEN);
  });

  test("the owner of a character built on it reads it", async () => {
    const { ruleset, reader } = await setup();
    await createTestCharacter(reader.user.id, { rulesetId: ruleset.id });
    expect(await readStatuses(reader.api, ruleset.id)).toEqual(READ);
  });

  test("an active contributor to a character built on it reads it", async () => {
    const { ruleset, reader } = await setup();
    const { user: characterOwner } = await createSignedInUser("character-owner");
    const character = await createTestCharacter(characterOwner.id, { rulesetId: ruleset.id });
    await addCharacterContributor(character.id, reader.user, characterOwner.id);
    expect(await readStatuses(reader.api, ruleset.id)).toEqual(READ);
  });

  test("anyone else gets the 404 an unknown ruleset gets", async () => {
    const { ruleset, reader } = await setup();
    expect(await readStatuses(reader.api, ruleset.id)).toEqual(HIDDEN);

    const hidden = await reader.api.api.rulesets[":id"].$get({ param: { id: ruleset.id } });
    const unknown = await reader.api.api.rulesets[":id"].$get({ param: { id: NIL_UUID } });
    expect(await hidden.json()).toEqual(await unknown.json());
  });

  test("a stranger's write is refused as before", async () => {
    const { ruleset, reader } = await setup();
    await expectStatus(
      reader.api.api.rulesets[":id"].$put({ param: { id: ruleset.id }, json: { name: "Taken", description: "" } }),
      403,
    );
  });
});

describe("a ruleset that isn't private", () => {
  test("anyone reads it, published or not", async () => {
    const { owner, reader } = await setup();
    const draft = await createSeededTestRuleset(owner.user.id, { private: false });
    const published = await createSeededTestRuleset(owner.user.id, { private: false, status: "Published" });
    expect(await readStatuses(reader.api, draft.id)).toEqual(READ);
    expect(await readStatuses(reader.api, published.id)).toEqual(READ);
  });
});
