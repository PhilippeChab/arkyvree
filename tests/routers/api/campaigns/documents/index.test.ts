import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Players } from "@/server/repositories/index.ts";
import { api, createSignedInUser, expectOk, expectStatus } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";

const documents = api.api.campaigns[":id"].documents;
const document = documents[":documentId"];

/** A campaign of the seed user's, and a player seated in it, with their client. */
async function setup() {
  const campaign = await postCampaign();
  const player = await createSignedInUser("player");
  const [seat] = await Players.create(db, {
    userId: player.user.id,
    campaignId: campaign.id,
    role: "Player Character",
  });
  return { campaign, player, seat };
}

describe("campaign documents", () => {
  test("creates, reads, edits and deletes a folder and a document", async () => {
    const { campaign } = await setup();
    const param = { id: campaign.id };
    const folder = await expectOk(documents.$post({ param, json: { kind: "Folder", name: "  Act 1  " } }));
    expect(folder).toMatchObject({ kind: "Folder", name: "Act 1", visibility: "Private", parentId: null });
    const map = await expectOk(
      documents.$post({ param, json: { kind: "Document", name: "Map", body: "The keep", parentId: folder.id } }),
    );

    expect((await expectOk(documents.$get({ param }))).items.map(({ name }) => name)).toEqual(["Act 1", "Map"]);
    const read = await expectOk(document.$get({ param: { ...param, documentId: map.id } }));
    expect(read).toMatchObject({ body: "The keep", path: [{ id: folder.id, name: "Act 1" }] });

    const edited = await expectOk(
      document.$put({
        param: { ...param, documentId: map.id },
        json: { name: "Keep map", parentId: null, visibility: "Public", updatedAt: map.updatedAt },
      }),
    );
    expect(edited).toMatchObject({ name: "Keep map", parentId: null, audience: { everyone: true } });
    await expectStatus(
      document.$put({ param: { ...param, documentId: map.id }, json: { name: "Stale", updatedAt: map.updatedAt } }),
      409,
    );

    expect(await expectOk(document.$delete({ param: { ...param, documentId: folder.id } }))).toEqual({
      id: folder.id,
    });
    expect((await expectOk(documents.$get({ param }))).items.map(({ name }) => name)).toEqual(["Keep map"]);
  });

  test("refuses a body its route doesn't take", async () => {
    const { campaign } = await setup();
    const param = { id: campaign.id };
    for (const json of [
      { kind: "Folder", name: "   " },
      { kind: "Note", name: "Map" },
      { kind: "Document", name: "Map", visibility: "Hidden" },
      { kind: "Document", name: "Map", readerIds: ["not-a-seat"] },
    ])
      await expectStatus(documents.$post({ param, json: json as never }), 400);
  });

  test("shows a player what admits them, answers a hidden item as an unknown one, and lets them change nothing", async () => {
    const { campaign, player, seat } = await setup();
    const param = { id: campaign.id };
    const shared = await expectOk(
      documents.$post({
        param,
        json: { kind: "Document", name: "Letter", visibility: "Selected", readerIds: [seat.id] },
      }),
    );
    const hidden = await expectOk(documents.$post({ param, json: { kind: "Document", name: "Twist" } }));

    const playerDocuments = player.api.api.campaigns[":id"].documents;
    const seen = await expectOk(playerDocuments.$get({ param }));
    expect(seen.items).toMatchObject([{ id: shared.id, visibility: null, readerIds: null, audience: null }]);
    await expectStatus(playerDocuments[":documentId"].$get({ param: { ...param, documentId: hidden.id } }), 404);
    await expectStatus(playerDocuments.$post({ param, json: { kind: "Document", name: "Mine" } }), 403);
    await expectStatus(playerDocuments[":documentId"].$delete({ param: { ...param, documentId: shared.id } }), 403);
  });
});
