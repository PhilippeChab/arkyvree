import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Campaigns, CharacterContributors, Contributors, Players } from "@/server/repositories/index.ts";
import { type api, createSignedInUser, expectOk, expectStatus } from "@/tests/support/api.ts";
import { addCharacterContributor, addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";

/** The entities a read under a ruleset names: seeded ones its fork inherits, and what its owner wrote in it. */
interface Fixture {
  abilityId: string;
  featId: string;
  fighterId: string;
  levelId: string;
  modifierId: string;
  wizardId: string;
}

type Client = typeof api;

/** A read of a ruleset, or of what's under it, by its id (`id`), as `client` asks it. */
type Read = (client: Client, id: string, fixture: Fixture) => Promise<{ json(): Promise<unknown>; status: number }>;

const HIDDEN = [404, 404, 404, 404];
const READ = [200, 200, 200, 200];

/** Every read a ruleset's id gates, by name. */
const READS: [string, Read][] = [
  ["the ruleset", (client, id) => client.api.rulesets[":id"].$get({ param: { id } })],
  ["its extensions", (client, id) => client.api.rulesets[":id"].extensions.$get({ param: { id } })],
  [
    "an entity list",
    (client, id) =>
      client.api.rulesets[":id"].entities[":entityType"].$get({ param: { id, entityType: "abilities" }, query: {} }),
  ],
  [
    "an entity list's groups",
    (client, id) =>
      client.api.rulesets[":id"].entities[":entityType"].grouped.$get({
        param: { id, entityType: "feats" },
        query: {},
      }),
  ],
  [
    "a kind's templates",
    (client, id) =>
      client.api.rulesets[":id"].entities[":entityType"].templates.$get({
        param: { id, entityType: "items" },
        query: {},
      }),
  ],
  [
    "an entity",
    (client, id, { abilityId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].$get({
        param: { id, entityType: "abilities", entityId: abilityId },
      }),
  ],
  [
    "an entity's links",
    (client, id, { fighterId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].links.$get({
        param: { id, entityType: "classes", entityId: fighterId },
      }),
  ],
  [
    "an entity's owned entities",
    (client, id, { fighterId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].owned.$get({
        param: { id, entityType: "classes", entityId: fighterId },
      }),
  ],
  [
    "an owned entity by its id",
    (client, id, { levelId }) =>
      client.api.rulesets[":id"].entities[":entityType"].owned[":ownedId"].$get({
        param: { id, entityType: "classes", ownedId: levelId },
      }),
  ],
  [
    "an entity's progression",
    (client, id, { fighterId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].progression.$get({
        param: { id, entityType: "classes", entityId: fighterId },
      }),
  ],
  [
    "an entity's table",
    (client, id, { wizardId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].tables[":table"].$get({
        param: { id, entityType: "classes", entityId: wizardId, table: "spells" },
      }),
  ],
  ["its Settings", (client, id) => client.api.rulesets[":id"].settings.$get({ param: { id } })],
  [
    "an entity's modifiers",
    (client, id, { featId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers.$get({
        param: { id, entityType: "feats", entityId: featId },
      }),
  ],
  [
    "an entity's modifier",
    (client, id, { featId, modifierId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].$get({
        param: { id, entityType: "feats", entityId: featId, modifierId },
      }),
  ],
  [
    "an entity's requirements",
    (client, id, { featId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements.$get({
        param: { id, entityType: "feats", entityId: featId },
      }),
  ],
  [
    "a target path's completions",
    (client, id) =>
      client.api.rulesets[":id"].customization.target.paths.completions.$post({
        param: { id },
        json: { partialPath: "", position: 0, kind: "modifier" },
      }),
  ],
  [
    "a target path's validation",
    (client, id) =>
      client.api.rulesets[":id"].customization.target.paths.validate.$post({
        param: { id },
        json: { path: "abilities.strength.misc", kind: "modifier" },
      }),
  ],
  ["its changes", (client, id) => client.api.rulesets[":id"].changes.$get({ param: { id } })],
  ["its contributors", (client, id) => client.api.rulesets[":id"].contributors.$get({ param: { id }, query: {} })],
  [
    "a new character's creation",
    (client, id) => client.api.characters.creation.$get({ query: { role: "score", rulesetId: id } }),
  ],
  [
    "a new character's creation pick",
    (client, id) => client.api.characters.creation[":role"].$get({ param: { role: "race" }, query: { rulesetId: id } }),
  ],
];

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

/**
 * A campaign on the ruleset with `userId` playing in it: archived when `archived` says `campaign`, their seat alone
 * when it says `seat`.
 */
async function seatPlayer(rulesetId: string, userId: string, archived?: "campaign" | "seat") {
  const now = new Date().toISOString();
  const [campaign] = await Campaigns.create(db, {
    name: `Campaign ${uniqueId()}`,
    rulesetId,
    deletedAt: archived === "campaign" ? now : undefined,
  });
  await Players.create(db, {
    campaignId: campaign.id,
    userId,
    role: "Player Character",
    deletedAt: archived === "seat" ? now : undefined,
  });
}

/** A private seeded fork, its owner, and a user who has no standing on it yet. */
async function setup() {
  const owner = await createSignedInUser("owner");
  const ruleset = await createSeededTestRuleset(owner.user.id, { private: true });
  const reader = await createSignedInUser("reader");
  return { owner, ruleset, reader };
}

/** What `READS` name in the fork, read and written by its owner: its seeded entities, a level, a modifier. */
async function setupFixture(owner: Client, id: string): Promise<Fixture> {
  const { abilityMap, classMap, featMap } = await getSeedCtx();
  const fighterId = classMap.pc["Fighter"];
  const levels = await expectOk(
    owner.api.rulesets[":id"].entities[":entityType"][":entityId"].owned.$get({
      param: { id, entityType: "classes", entityId: fighterId },
    }),
  );
  const modifier = await expectOk(
    owner.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers.$post({
      param: { id, entityType: "feats", entityId: featMap["Dodge"] },
      json: { target: "abilities.strength.misc", value: "2", operator: "add" },
    }),
  );
  return {
    abilityId: abilityMap["Strength"],
    featId: featMap["Dodge"],
    fighterId,
    levelId: levels[0].id,
    modifierId: modifier.id,
    wizardId: classMap.pc["Wizard"],
  };
}

describe("every read a private ruleset's id gates", () => {
  test.each(READS)("%s: its owner reads it, a stranger gets the 404 an unknown ruleset gets", async (_name, read) => {
    const { owner, ruleset, reader } = await setup();
    const fixture = await setupFixture(owner.api, ruleset.id);

    expect((await read(owner.api, ruleset.id, fixture)).status).toBe(200);
    const hidden = await read(reader.api, ruleset.id, fixture);
    const unknown = await read(reader.api, NIL_UUID, fixture);
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual(await unknown.json());
  });
});

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

  test("a player in a campaign on it reads it, but not once the campaign or their seat is deleted", async () => {
    const { ruleset, reader } = await setup();
    const { user: exPlayer, api: exPlayerApi } = await createSignedInUser("ex-player");
    const { user: unseated, api: unseatedApi } = await createSignedInUser("unseated");
    await seatPlayer(ruleset.id, reader.user.id);
    await seatPlayer(ruleset.id, exPlayer.id, "campaign");
    await seatPlayer(ruleset.id, unseated.id, "seat");

    expect(await readStatuses(reader.api, ruleset.id)).toEqual(READ);
    expect(await readStatuses(exPlayerApi, ruleset.id)).toEqual(HIDDEN);
    expect(await readStatuses(unseatedApi, ruleset.id)).toEqual(HIDDEN);
  });

  test("the owner of a character built on it reads it, archived or not", async () => {
    const { ruleset, reader } = await setup();
    const { user: archiver, api: archiverApi } = await createSignedInUser("archiver");
    await createTestCharacter(reader.user.id, { rulesetId: ruleset.id });
    await createTestCharacter(archiver.id, { rulesetId: ruleset.id, deletedAt: new Date().toISOString() });

    expect(await readStatuses(reader.api, ruleset.id)).toEqual(READ);
    expect(await readStatuses(archiverApi, ruleset.id)).toEqual(READ);
  });

  test("an active contributor to a character built on it reads it, a pending one doesn't", async () => {
    const { ruleset, reader } = await setup();
    const { user: characterOwner } = await createSignedInUser("character-owner");
    const { user: invitee, api: inviteeApi } = await createSignedInUser("invitee");
    const character = await createTestCharacter(characterOwner.id, { rulesetId: ruleset.id });
    await addCharacterContributor(character.id, reader.user, characterOwner.id);
    await CharacterContributors.create(db, {
      characterId: character.id,
      userId: invitee.id,
      email: invitee.emailAddress,
      role: "Editor",
      invitedBy: characterOwner.id,
    });

    expect(await readStatuses(reader.api, ruleset.id)).toEqual(READ);
    expect(await readStatuses(inviteeApi, ruleset.id)).toEqual(HIDDEN);
  });

  test("anyone else gets the 404 an unknown ruleset gets", async () => {
    const { ruleset, reader } = await setup();
    expect(await readStatuses(reader.api, ruleset.id)).toEqual(HIDDEN);
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
