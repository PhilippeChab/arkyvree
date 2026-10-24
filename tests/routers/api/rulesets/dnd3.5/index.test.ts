import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const rulesets = api.api.rulesets;
const ruleset = rulesets[":id"];

/** A public seeded fork published as an extension, so others can star or subscribe to it. */
async function createPublishedExtension(name: string) {
  const { id } = await createSeededTestRuleset(SEED_USER_ID, { name, private: false });
  await expectOk(ruleset.publish.$post({ param: { id }, json: { kind: "extension" } }));
  return id;
}

describe("rulesets", () => {
  test("lists rulesets by scope and search, and reads one", async () => {
    const { rulesetId } = await getSeedCtx();
    const base = await expectOk(rulesets.$get({ query: { scope: "base", search: "Core SRD" } }));
    expect(base.items.map((r) => r.id)).toContain(rulesetId);

    const detail = await expectOk(ruleset.$get({ param: { id: rulesetId } }));
    expect(detail).toMatchObject({ id: rulesetId, name: "Core SRD 3.5" });
  });

  test("lists a user's forks of one kind, however many of another come first", async () => {
    const { rulesetId } = await getSeedCtx();
    const { api: userApi, user } = await createSignedInUser();
    const fork = { rulesetId, ancestorRulesetIds: [rulesetId] };
    // The oldest, so a list by creation, the newest first, holds it last
    const playable = await createTestRuleset(user.id, { ...fork, createdAt: "2000-01-01T00:00:00Z" });
    // More forks published as an extension than a page holds
    for (let index = 0; index < 11; index++) await createTestRuleset(user.id, { ...fork, kind: "extension" });
    const list = (query: Record<string, string>) =>
      expectOk(userApi.api.rulesets.$get({ query: { scope: "forked", limit: "2", ...query } }));

    expect((await list({})).items.map((ruleset) => ruleset.kind)).toEqual(["extension", "extension"]);
    expect((await list({ kind: "ruleset" })).items.map((ruleset) => ruleset.id)).toEqual([playable.id]);
  });

  test("forks a ruleset", async () => {
    const { rulesetId } = await getSeedCtx();
    const fork = await expectOk(
      ruleset.fork.$post({ param: { id: rulesetId }, json: { name: "Router Fork", description: "", private: true } }),
    );
    expect(fork).toMatchObject({ name: "Router Fork", rulesetId, private: true });
  });

  test("updates a ruleset", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const json = { name: "Updated Test Ruleset", description: "Updated description", private: false };
    expect(await expectOk(ruleset.$put({ param: { id }, json }))).toMatchObject(json);
  });

  test("archives and unarchives a ruleset", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect(await expectOk(ruleset.archive.$post({ param: { id } }))).toMatchObject({ status: "Archived" });
    await expectOk(ruleset.unarchive.$post({ param: { id } }));
    expect(await expectOk(ruleset.$get({ param: { id } }))).toMatchObject({ status: "Draft" });
  });

  test("stars and unstars a published ruleset, and lists it under the starred scope", async () => {
    const id = await createPublishedExtension("Ruleset To Star");

    expect((await ruleset.star.$post({ param: { id } })).status).toBe(201);
    expect(await expectOk(ruleset.$get({ param: { id } }))).toMatchObject({ isStarred: true });
    const starred = await expectOk(rulesets.$get({ query: { scope: "starred" } }));
    expect(starred.items.map((r) => r.id)).toContain(id);

    await expectOk(ruleset.star.$delete({ param: { id } }));
    expect(await expectOk(ruleset.$get({ param: { id } }))).toMatchObject({ isStarred: false });
  });

  test("refuses to star a draft", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID, { private: false });
    await expectStatus(ruleset.star.$post({ param: { id } }), 403);
  });

  test("subscribes a fork to an extension, lists it and unsubscribes", async () => {
    const extensionId = await createPublishedExtension("Router Extension");
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    await expectOk(ruleset.subscribe.$post({ param: { id }, json: { extensionIds: [extensionId] } }));
    expect((await expectOk(ruleset.extensions.$get({ param: { id } }))).map((e) => e.extensionId)).toEqual([
      extensionId,
    ]);

    await expectOk(ruleset.unsubscribe.$post({ param: { id }, json: { extensionId } }));
    expect(await expectOk(ruleset.extensions.$get({ param: { id } }))).toEqual([]);
  });

  test("lists a fork's changes and restores an overridden entity", async () => {
    const { langMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const entityId = langMap["Draconic"];
    await expectOk(
      ruleset.entities[":entityType"][":entityId"].$put({
        param: { id, entityType: "languages", entityId },
        json: { name: "Draconic", description: "Edited", type: "Exotic" },
      }),
    );

    const changes = await expectOk(ruleset.changes.$get({ param: { id } }));
    expect(changes).toContainEqual(
      expect.objectContaining({ entityType: "languages", status: "modified", sourceEntityId: entityId }),
    );

    await expectOk(
      ruleset.entities[":entityType"][":entityId"].restore.$post({ param: { id, entityType: "languages", entityId } }),
    );
    expect(await expectOk(ruleset.changes.$get({ param: { id } }))).toEqual([]);
  });

  test("restores an overridden class through its URL segment, classes", async () => {
    const { klassMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const entityId = klassMap.pc["Fighter"];
    await expectOk(
      ruleset.entities[":entityType"][":entityId"].$put({
        param: { id, entityType: "classes", entityId },
        json: { name: "Fighter", description: "Edited" },
      }),
    );
    expect(await expectOk(ruleset.changes.$get({ param: { id } }))).toContainEqual(
      expect.objectContaining({ entityType: "classes", status: "modified", sourceEntityId: entityId }),
    );

    await expectOk(
      ruleset.entities[":entityType"][":entityId"].restore.$post({ param: { id, entityType: "classes", entityId } }),
    );
    expect(await expectOk(ruleset.changes.$get({ param: { id } }))).toEqual([]);
  });

  test("requires a session", async () => {
    await expectStatus(guestApi.api.rulesets.$get({ query: {} }), 401);
    await expectStatus(guestApi.api.rulesets[":id"].$get({ param: { id: NIL_UUID } }), 401);
  });

  test("returns 404 for a missing ruleset", async () => {
    const param = { id: NIL_UUID };
    await expectStatus(ruleset.$get({ param }), 404);
    await expectStatus(ruleset.star.$post({ param }), 404);
    await expectStatus(ruleset.archive.$post({ param }), 404);
    await expectStatus(ruleset.changes.$get({ param }), 404);
  });
});
