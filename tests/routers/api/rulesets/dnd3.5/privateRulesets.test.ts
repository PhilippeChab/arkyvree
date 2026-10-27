import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Campaigns, CharacterContributors, Contributors, Players } from "@/server/repositories/index.ts";
import { type api, createSignedInUser, expectOk } from "@/tests/support/api.ts";
import { addCharacterContributor, addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";

/**
 * What a request under a ruleset names: seeded entities its fork inherits, what its owner wrote in it (a level, a
 * modifier, a requirement), its Viewer contributor, and the fork of the session that asks (`ownFork`).
 */
interface Fixture {
  abilityId: string;
  contributorId: string;
  featId: string;
  fighterId: string;
  itemId: string;
  levelId: string;
  modifierId: string;
  ownFork: string;
  requirementId: string;
  skillId: string;
  wizardId: string;
}

type Client = typeof api;

/** Who reads a private ruleset but may not write it: its Viewer contributor, or a member of an archived campaign. */
type Reader = "member" | "viewer";

/** A request that names a ruleset, or what's under it, by an id (`id`), as `client` asks it. */
type Request = (client: Client, id: string, fixture: Fixture) => Promise<{ json(): Promise<unknown>; status: number }>;

/** A user signed in through the API, as `createSignedInUser` makes one. */
type SignedIn = Awaited<ReturnType<typeof createSignedInUser>>;

const HIDDEN = [404, 404, 404, 404];
const READ = [200, 200, 200, 200];

/** Every read a ruleset's id gates, by name. */
const READS: [string, Request][] = [
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

/**
 * Every write that names a ruleset, or what's under it, by an id, by name: what a reader who may not write gets (its
 * status), which reader that is, and whose id it is: the ruleset's, or a contributor's.
 */
const WRITES: [string, Request, number, Reader, "contributorId" | "rulesetId"][] = [
  [
    "an update",
    (client, id) => client.api.rulesets[":id"].$put({ param: { id }, json: { name: "Taken", description: "" } }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an archive",
    (client, id) => client.api.rulesets[":id"].archive.$post({ param: { id } }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an unarchive",
    (client, id) => client.api.rulesets[":id"].unarchive.$post({ param: { id } }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a publish",
    (client, id) => client.api.rulesets[":id"].publish.$post({ param: { id }, json: {} }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a fork",
    (client, id) =>
      client.api.rulesets[":id"].fork.$post({
        param: { id },
        json: { name: `Fork ${uniqueId()}`, description: "", private: true },
      }),
    422,
    "viewer",
    "rulesetId",
  ],
  ["a star", (client, id) => client.api.rulesets[":id"].star.$post({ param: { id } }), 403, "viewer", "rulesetId"],
  [
    "a contributor's invite",
    (client, id) =>
      client.api.rulesets[":id"].contributors.$post({
        param: { id },
        json: { email: "x@example.com", role: "Editor" },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a contributor's role change",
    (client, contributorId, { ownFork }) =>
      client.api.rulesets[":id"].contributors[":contributorId"].$put({
        param: { id: ownFork, contributorId },
        json: { role: "Editor" },
      }),
    403,
    "viewer",
    "contributorId",
  ],
  [
    "a contributor's revoke",
    (client, contributorId, { ownFork }) =>
      client.api.rulesets[":id"].contributors[":contributorId"].$delete({ param: { id: ownFork, contributorId } }),
    403,
    "viewer",
    "contributorId",
  ],
  [
    "its Settings' save",
    (client, id) => client.api.rulesets[":id"].settings.$put({ param: { id }, json: {} }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an entity's create",
    (client, id) =>
      client.api.rulesets[":id"].entities[":entityType"].$post({
        param: { id, entityType: "feats" },
        json: { name: `Feat ${uniqueId()}` },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an entity's update",
    (client, id, { featId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].$put({
        param: { id, entityType: "feats", entityId: featId },
        json: { name: "Dodge" },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an entity's delete",
    (client, id, { featId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].$delete({
        param: { id, entityType: "feats", entityId: featId },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an entity's duplicate",
    (client, id, { itemId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].duplicate.$post({
        param: { id, entityType: "items", entityId: itemId },
        json: { name: `Copy ${uniqueId()}` },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an entity's variants",
    (client, id, { itemId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].variants.$post({
        param: { id, entityType: "items", entityId: itemId },
        json: { variants: [{ name: `Variant ${uniqueId()}` }] },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an entity's link",
    (client, id, { fighterId, skillId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].links.$post({
        param: { id, entityType: "classes", entityId: fighterId },
        json: { targetId: skillId },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an entity's link's removal",
    (client, id, { fighterId, skillId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].links[":targetId"].$delete({
        param: { id, entityType: "classes", entityId: fighterId, targetId: skillId },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an owned entity's create",
    (client, id, { fighterId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].owned.$post({
        param: { id, entityType: "classes", entityId: fighterId },
        json: {},
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an owned entity's update",
    (client, id, { fighterId, levelId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].owned[":ownedId"].$put({
        param: { id, entityType: "classes", entityId: fighterId, ownedId: levelId },
        json: {},
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an owned entity's delete",
    (client, id, { fighterId, levelId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].owned[":ownedId"].$delete({
        param: { id, entityType: "classes", entityId: fighterId, ownedId: levelId },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a progression's save",
    (client, id, { fighterId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].progression.$put({
        param: { id, entityType: "classes", entityId: fighterId },
        json: {} as never,
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an entity's restore",
    (client, id, { featId }) =>
      client.api.rulesets[":id"].entities[":entityType"][":entityId"].restore.$post({
        param: { id, entityType: "feats", entityId: featId },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a modifier's create",
    (client, id, { featId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers.$post({
        param: { id, entityType: "feats", entityId: featId },
        json: { target: "abilities.strength.misc", value: "1", operator: "add" },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a modifier's duplicate",
    (client, id, { featId, modifierId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].duplicate.$post({
        param: { id, entityType: "feats", entityId: featId, modifierId },
        json: { target: "abilities.strength.misc", value: "1", operator: "add" },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a modifier's update",
    (client, id, { featId, modifierId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].$put({
        param: { id, entityType: "feats", entityId: featId, modifierId },
        json: { target: "abilities.strength.misc", value: "1", operator: "add" },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a modifier's delete",
    (client, id, { featId, modifierId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].$delete({
        param: { id, entityType: "feats", entityId: featId, modifierId },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a requirement's create",
    (client, id, { featId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements.$post({
        param: { id, entityType: "feats", entityId: featId },
        json: { level: "1", chainingOperator: "and" },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a requirement's update",
    (client, id, { featId, requirementId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements[":requirementId"].$put({
        param: { id, entityType: "feats", entityId: featId, requirementId },
        json: { level: "1", chainingOperator: "or" },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a requirement's delete",
    (client, id, { featId, requirementId }) =>
      client.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements[":requirementId"].$delete({
        param: { id, entityType: "feats", entityId: featId, requirementId },
      }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an extension's subscribe, on it",
    (client, id, { ownFork }) =>
      client.api.rulesets[":id"].subscribe.$post({ param: { id }, json: { extensionIds: [ownFork] } }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "an extension's subscribe, to it",
    (client, id, { ownFork }) =>
      client.api.rulesets[":id"].subscribe.$post({ param: { id: ownFork }, json: { extensionIds: [id] } }),
    422,
    "viewer",
    "rulesetId",
  ],
  [
    "an extension's unsubscribe",
    (client, id, { ownFork }) =>
      client.api.rulesets[":id"].unsubscribe.$post({ param: { id }, json: { extensionId: ownFork } }),
    403,
    "viewer",
    "rulesetId",
  ],
  [
    "a character's create",
    (client, id) =>
      client.api.characters.$post({
        json: { rulesetId: id, name: "Hero", picks: {}, scores: {}, fields: {} },
      }),
    403,
    "member",
    "rulesetId",
  ],
  [
    "a character's import",
    (client, id) => client.api.characters.import.$post({ json: { rulesetId: id, text: "A character" } }),
    403,
    "member",
    "rulesetId",
  ],
  [
    "a campaign's create",
    (client, id) => client.api.campaigns.$post({ json: { name: `Campaign ${uniqueId()}`, rulesetId: id } }),
    403,
    "member",
    "rulesetId",
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
 * A campaign on the ruleset with `userId` playing in it: archived when `left` says `campaign`, their seat alone when it
 * says `seat`, and their seat deleted, as a removed player's is, when it says `removed`.
 */
async function seatPlayer(rulesetId: string, userId: string, left?: "campaign" | "removed" | "seat") {
  const now = new Date().toISOString();
  const [campaign] = await Campaigns.create(db, {
    name: `Campaign ${uniqueId()}`,
    rulesetId,
    deletedAt: left === "campaign" ? now : undefined,
  });
  const [player] = await Players.create(db, {
    campaignId: campaign.id,
    userId,
    role: "Player Character",
    deletedAt: left === "seat" ? now : undefined,
  });
  if (left === "removed") await Players.delete(db, { id: player.id });
}

/** A private seeded fork, its owner, and a user who has no standing on it yet. */
async function setup() {
  const owner = await createSignedInUser("owner");
  const ruleset = await createSeededTestRuleset(owner.user.id, { private: true });
  const reader = await createSignedInUser("reader");
  return { owner, ruleset, reader };
}

/**
 * What the requests name in the private fork (`id`), written by its owner: its seeded entities, a level, a modifier and
 * a requirement, and its Viewer contributor (`viewer`); and the fork of the session that asks (`ownFork`).
 */
async function setupFixture(owner: SignedIn, id: string, viewer: SignedIn["user"], ownFork: string): Promise<Fixture> {
  const { abilityMap, classMap, featMap, itemMap, skillMap } = await getSeedCtx();
  const fighterId = classMap.pc["Fighter"];
  const featId = featMap["Dodge"];
  const levels = await expectOk(
    owner.api.api.rulesets[":id"].entities[":entityType"][":entityId"].owned.$get({
      param: { id, entityType: "classes", entityId: fighterId },
    }),
  );
  const customization = owner.api.api.rulesets[":id"].customization[":entityType"][":entityId"];
  const param = { id, entityType: "feats", entityId: featId };
  const modifier = await expectOk(
    customization.modifiers.$post({ param, json: { target: "abilities.strength.misc", value: "2", operator: "add" } }),
  );
  const requirement = await expectOk(
    customization.requirements.$post({
      param,
      json: { level: "9", target: "abilities.charisma.total", value: "13", operator: "greater_than_or_equal" },
    }),
  );
  const contributor = await addRulesetContributor(id, viewer, owner.user.id, "Viewer");
  return {
    abilityId: abilityMap["Strength"],
    contributorId: contributor.id,
    featId,
    fighterId,
    itemId: Object.values(itemMap)[0],
    levelId: levels[0].id,
    modifierId: modifier.id,
    ownFork,
    requirementId: requirement.id,
    skillId: skillMap["Climb"],
    wizardId: classMap.pc["Wizard"],
  };
}

/**
 * A private fork, its owner, a stranger, and who reads it but may not write it, each with a fork of their own; and
 * what the requests name in it.
 */
async function setupRequests() {
  const { owner, ruleset, reader: stranger } = await setup();
  const viewer = await createSignedInUser("viewer");
  const member = await createSignedInUser("member");
  await seatPlayer(ruleset.id, member.user.id, "campaign");
  const forkOf = async ({ user }: SignedIn) => (await createSeededTestRuleset(user.id)).id;
  const fixture = await setupFixture(owner, ruleset.id, viewer.user, await forkOf(stranger));
  const readers = {
    member: { client: member.api, fixture: { ...fixture, ownFork: await forkOf(member) } },
    viewer: { client: viewer.api, fixture: { ...fixture, ownFork: await forkOf(viewer) } },
  };
  return { owner, ruleset, stranger, fixture, readers };
}

describe("every read a private ruleset's id gates", () => {
  test.each(READS)("%s: its owner reads it, a stranger gets the 404 an unknown ruleset gets", async (_name, read) => {
    const { owner, ruleset, stranger, fixture } = await setupRequests();

    expect((await read(owner.api, ruleset.id, fixture)).status).toBe(200);
    const hidden = await read(stranger.api, ruleset.id, fixture);
    const unknown = await read(stranger.api, NIL_UUID, fixture);
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual(await unknown.json());
  });
});

describe("every write a private ruleset's id names", () => {
  test.each(WRITES)(
    "%s: a stranger gets what an unknown id gets, a reader who may not write is refused",
    async (_name, write, refused, reader, idOf) => {
      const { ruleset, stranger, fixture, readers } = await setupRequests();
      const id = idOf === "contributorId" ? fixture.contributorId : ruleset.id;

      const hidden = await write(stranger.api, id, fixture);
      const unknown = await write(stranger.api, NIL_UUID, fixture);
      expect([hidden.status, await hidden.json()]).toEqual([unknown.status, await unknown.json()]);
      expect(hidden.status).toBe(404);

      const { client, fixture: own } = readers[reader];
      expect((await write(client, id, own)).status).toBe(refused);
    },
  );

  test("an unstar and a leave answer a stranger as an unknown id", async () => {
    const { ruleset, stranger } = await setupRequests();
    for (const write of [
      (id: string) => stranger.api.api.rulesets[":id"].star.$delete({ param: { id } }),
      (id: string) => stranger.api.api.rulesets[":id"].contributors.leave.$post({ param: { id } }),
    ]) {
      const hidden = await write(ruleset.id);
      const unknown = await write(NIL_UUID);
      expect([hidden.status, await hidden.json()]).toEqual([unknown.status, await unknown.json()]);
    }
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

  test("a member of a campaign on it reads it, archived or not, but not a removed player", async () => {
    const { ruleset, reader } = await setup();
    const archivedCampaign = await createSignedInUser("archived-campaign");
    const archivedSeat = await createSignedInUser("archived-seat");
    const removed = await createSignedInUser("removed");
    await seatPlayer(ruleset.id, reader.user.id);
    await seatPlayer(ruleset.id, archivedCampaign.user.id, "campaign");
    await seatPlayer(ruleset.id, archivedSeat.user.id, "seat");
    await seatPlayer(ruleset.id, removed.user.id, "removed");

    expect(await readStatuses(reader.api, ruleset.id)).toEqual(READ);
    expect(await readStatuses(archivedCampaign.api, ruleset.id)).toEqual(READ);
    expect(await readStatuses(archivedSeat.api, ruleset.id)).toEqual(READ);
    expect(await readStatuses(removed.api, ruleset.id)).toEqual(HIDDEN);
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
