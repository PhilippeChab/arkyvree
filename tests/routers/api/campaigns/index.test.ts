import { describe, expect, test } from "bun:test";

import { api, expectOk, guestApi } from "@/tests/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/helpers.ts";

const campaigns = api.api.campaigns;
const campaign = campaigns[":id"];

async function createCampaign(name = "Test Campaign") {
  const { rulesetId } = await getSeedCtx();
  const created = await expectOk(campaigns.$post({ json: { name, description: "A test campaign", rulesetId } }));
  return created.campaign;
}

describe("campaigns", () => {
  test("creates, reads, lists and updates a campaign", async () => {
    const { rulesetId } = await getSeedCtx();
    const created = await createCampaign("Router Campaign");
    expect(created).toMatchObject({ name: "Router Campaign", description: "A test campaign", rulesetId });

    expect(await expectOk(campaign.$get({ param: { id: created.id } }))).toMatchObject({
      id: created.id,
      name: "Router Campaign",
    });
    const list = await expectOk(campaigns.$get({ query: { search: "Router Campaign" } }));
    expect(list.items.map((c) => c.id)).toEqual([created.id]);

    const updated = await expectOk(
      campaign.$put({ param: { id: created.id }, json: { name: "Renamed Campaign", description: "Updated" } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Campaign", description: "Updated" });
  });

  test("archives, unarchives and permanently deletes a campaign", async () => {
    const { id } = await createCampaign();
    const listed = async (visibility: "active" | "archived") =>
      (await expectOk(campaigns.$get({ query: { visibility } }))).items.map((c) => c.id);

    await expectOk(campaign.$delete({ param: { id } }));
    expect(await listed("active")).not.toContain(id);
    expect(await listed("archived")).toContain(id);

    await expectOk(campaign.unarchive.$post({ param: { id } }));
    expect(await listed("active")).toContain(id);

    await expectOk(campaign.$delete({ param: { id } }));
    await expectOk(campaign.permanent.$delete({ param: { id } }));
    expect((await campaign.$get({ param: { id } })).status).toBe(404);
  });

  test("only deletes an archived campaign permanently", async () => {
    const { id } = await createCampaign();
    expect((await campaign.permanent.$delete({ param: { id } })).status).toBe(404);
  });

  test("requires a session", async () => {
    expect((await guestApi.api.campaigns.$get({ query: {} })).status).toBe(401);
  });

  test("rejects a campaign without a name or with a ruleset id that isn't a UUID", async () => {
    const { rulesetId } = await getSeedCtx();
    expect((await campaigns.$post({ json: { description: "No name", rulesetId } as never })).status).toBe(400);
    expect((await campaigns.$post({ json: { name: "Campaign", rulesetId: "invalid-uuid" } })).status).toBe(400);
  });

  test("returns 404 for a missing campaign", async () => {
    expect((await campaign.$get({ param: { id: NIL_UUID } })).status).toBe(404);
  });
});
