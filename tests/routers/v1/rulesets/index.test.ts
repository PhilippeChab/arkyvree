import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFork, findBaseRuleset, readRulesOf } from "@/tests/support/v1.ts";

/** The seed user's key, the base ruleset it reads, and its rules as `GET /v1/rules` describes them. */
async function keyedBase() {
  const { api } = await createKeyedApi();
  const { id } = await findBaseRuleset(api);
  return { api, id, rules: await readRulesOf(api, id) };
}

describe("v1 rulesets", () => {
  test("lists the rulesets the user can read, and answers one with what they may do with it", async () => {
    const { api, id } = await keyedBase();
    const ruleset = await expectOk(api.v1.rulesets[":id"].$get({ param: { id } }));

    expect(ruleset).toMatchObject({ id, kind: "ruleset", parentId: null, parentName: null, system: true });
    expect(ruleset.permissions).toMatchObject({ canFork: true });
    await expectStatus(api.v1.rulesets[":id"].$get({ param: { id: NIL_UUID } }), 404);
  });

  test("describes the base rules' kinds, each a kind the entities' routes take", async () => {
    const { api, id, rules } = await keyedBase();
    const entities = api.v1.rulesets[":id"].entities[":kind"];

    expect(rules.kinds.length).toBeGreaterThan(0);
    for (const { type } of rules.kinds) await expectOk(entities.$get({ param: { id, kind: type }, query: {} }));
    expect(rules.characterKinds.length).toBeGreaterThan(0);
    expect(rules.tiers.every(({ level }) => Number.isInteger(level))).toBe(true);
    await expectStatus(entities.$get({ param: { id, kind: "nothing" }, query: {} }), 400);
  });

  test("describes a new character's form: each field by its key, each pick and score by its role", async () => {
    const { rules } = await keyedBase();
    const { sections } = rules.characterForm;
    const items = sections.flatMap((section) =>
      section.kind === "fields" ? (section.lines as { key?: string; kind: string; role?: string }[][]).flat() : [],
    );

    expect(items.some(({ key }) => key !== undefined)).toBe(true);
    expect(items.filter(({ kind }) => kind === "pick").every(({ role }) => typeof role === "string")).toBe(true);
    const scores = sections.filter(({ kind }) => kind === "scores");
    expect(scores.every(({ role }) => typeof role === "string")).toBe(true);
  });

  test("answers a ruleset's settings by the rules' ruleset fields, and its extensions", async () => {
    const { api, id, rules } = await keyedBase();
    const declared = rules.fields.rulesets ?? [];

    const settings = await expectOk(api.v1.rulesets[":id"].settings.$get({ param: { id } }));
    const fieldKeys = declared.flatMap(({ field }) => (typeof field === "string" ? [field] : []));
    const linkRoles = declared.flatMap(({ role }) => (typeof role === "string" ? [role] : []));
    expect(Object.keys(settings.fields).length + Object.keys(settings.links).length).toBeGreaterThan(0);
    expect(Object.keys(settings.fields).every((key) => fieldKeys.includes(key))).toBe(true);
    expect(Object.keys(settings.links).every((role) => linkRoles.includes(role))).toBe(true);
    expect(await expectOk(api.v1.rulesets[":id"].extensions.$get({ param: { id } }))).toEqual([]);

    const { user } = await createTestUser();
    const fork = await createFork(user.id, id, { extensions: true });
    const keyed = await createKeyedApi(user.id);
    expect(await expectOk(keyed.api.v1.rulesets[":id"].extensions.$get({ param: { id: fork.id } }))).toContainEqual(
      expect.objectContaining({ subscribedAt: expect.any(String), updateAvailable: false }),
    );
  });

  test("forks a ruleset, updates it, refusing a stale update, stars it and archives it", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id: baseId } = await findBaseRuleset(api);
    const rulesets = api.v1.rulesets[":id"];

    const json = { description: "A keyed fork", name: `Keyed Fork ${crypto.randomUUID()}`, private: true };
    const fork = await expectOk(rulesets.fork.$post({ json, param: { id: baseId } }));
    expect(fork).toMatchObject({ name: json.name, parentId: baseId, private: true });

    const param = { id: fork.id };
    const edit = { description: "Renamed", name: json.name, updatedAt: fork.updatedAt };
    expect((await expectOk(rulesets.$put({ json: edit, param }))).description).toBe("Renamed");
    await expectStatus(rulesets.$put({ json: { ...edit, description: "Stale" }, param }), 409);

    expect((await expectOk(rulesets.star.$post({ param: { id: baseId } }))).starred).toBe(true);
    expect((await expectOk(rulesets.star.$delete({ param: { id: baseId } }))).starred).toBe(false);
    await expectStatus(rulesets.$delete({ param }), 204);
    expect((await expectOk(rulesets.unarchive.$post({ param }))).status).not.toBe("Archived");
  });

  test("publishes a ruleset", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id } = await createFork(user.id, (await findBaseRuleset(api)).id);
    const published = await expectOk(api.v1.rulesets[":id"].publish.$post({ json: {}, param: { id } }));
    expect(published).toMatchObject({ id, status: "Published" });
  });
});
