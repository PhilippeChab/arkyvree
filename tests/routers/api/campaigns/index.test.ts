import { describe, expect, test } from "bun:test";

import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

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
    await expectStatus(campaign.$get({ param: { id } }), 404);
  });

  test("only deletes an archived campaign permanently", async () => {
    const { id } = await createCampaign();
    await expectStatus(campaign.permanent.$delete({ param: { id } }), 404);
  });

  test("requires a session", async () => {
    await expectStatus(guestApi.api.campaigns.$get({ query: {} }), 401);
  });

  test("rejects a campaign without a name or with a ruleset id that isn't a UUID", async () => {
    const { rulesetId } = await getSeedCtx();
    await expectStatus(campaigns.$post({ json: { description: "No name", rulesetId } as never }), 400);
    await expectStatus(campaigns.$post({ json: { name: "Campaign", rulesetId: "invalid-uuid" } }), 400);
  });

  test("returns 404 for a missing campaign", async () => {
    await expectStatus(campaign.$get({ param: { id: NIL_UUID } }), 404);
  });
});
