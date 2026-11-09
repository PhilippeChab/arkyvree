import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Players } from "@/server/repositories/index.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
import { MAX_DOCUMENT_FILE_BYTES } from "@/shared/attachments.ts";
import { api, createSignedInUser, expectOk, expectStatus } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";
import { fakeStorage } from "@/tests/support/storage.ts";

const documents = api.api.campaigns[":id"].documents;
const document = documents[":documentId"];

/** A PNG's first bytes, which name its type, then `size` bytes in all, under `name`. */
function png(name: string, size = 64) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], name, { type: "image/png" });
}

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

  test("puts a file in a document, hands its bytes to whoever sees it, and removes it", async () => {
    const { campaign, player } = await setup();
    const stored = new Map<string, Uint8Array>();
    ObjectStorage.setForTest(
      fakeStorage({
        putObject: async (key, data) => void stored.set(key, data),
        readObject: async (key) => (stored.has(key) ? new Uint8Array(stored.get(key)!) : null),
        deleteObject: async (key) => void stored.delete(key),
      }),
    );
    const param = { id: campaign.id };
    const map = await expectOk(
      documents.$post({ param, json: { kind: "Document", name: "Map", visibility: "Public" } }),
    );
    const twist = await expectOk(documents.$post({ param, json: { kind: "Document", name: "Twist" } }));
    const mapFile = document.file;
    const file = mapFile.$put({ param: { ...param, documentId: map.id }, form: { file: png("Keep map.png") } });
    expect(await expectOk(file)).toEqual({
      name: "Keep map.png",
      contentType: "image/png",
      byteSize: 64,
      uploadedAt: expect.any(String),
    });

    const playerFile = player.api.api.campaigns[":id"].documents[":documentId"].file;
    const read = await playerFile.$get({ param: { ...param, documentId: map.id } });
    expect(read.status).toBe(200);
    expect(Object.fromEntries(read.headers)).toMatchObject({
      "cache-control": "private, no-store",
      "content-disposition": "inline; filename*=UTF-8''Keep%20map.png",
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
    });
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(new Uint8Array(await png("Keep map.png").arrayBuffer()));

    // A hidden document's file is an unknown one's, and a player changes none
    await mapFile.$put({ param: { ...param, documentId: twist.id }, form: { file: png("twist.png") } });
    await expectStatus(playerFile.$get({ param: { ...param, documentId: twist.id } }), 404);
    await expectStatus(
      playerFile.$put({ param: { ...param, documentId: map.id }, form: { file: png("mine.png") } }),
      403,
    );
    await expectStatus(playerFile.$delete({ param: { ...param, documentId: map.id } }), 403);

    // Past what a document's file takes, and past what the route reads at all
    for (const size of [MAX_DOCUMENT_FILE_BYTES + 1, MAX_DOCUMENT_FILE_BYTES + 128 * 1024]) {
      await expectStatus(
        mapFile.$put({ param: { ...param, documentId: map.id }, form: { file: png("big.png", size) } }),
        400,
      );
    }

    expect(await expectOk(mapFile.$delete({ param: { ...param, documentId: map.id } }))).toEqual({ id: map.id });
    await expectStatus(playerFile.$get({ param: { ...param, documentId: map.id } }), 404);
    expect(stored.size).toBe(1);
  });
});
