import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Players } from "@/server/repositories/index.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
import { MAX_DOCUMENT_FILE_BYTES, WORD_DOCUMENT_TYPE } from "@/shared/attachments.ts";
import { api, createSignedInUser, expectOk, expectStatus } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";
import { fakeStorage, readBody, streamOf } from "@/tests/support/storage.ts";

const documents = api.api.campaigns[":id"].documents;
const document = documents[":documentId"];

/** What a file's upload sends as its body: its bytes, which the route streams to the storage. */
function bodyOf(file: File) {
  return { init: { body: file } };
}

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
  test("creates, reads, edits and deletes a folder and a note", async () => {
    const { campaign } = await setup();
    const param = { id: campaign.id };
    const folder = await expectOk(documents.$post({ param, json: { kind: "Folder", name: "  Act 1  " } }));
    expect(folder).toMatchObject({ kind: "Folder", name: "Act 1", visibility: "Private", parentId: null });
    const map = await expectOk(
      documents.$post({ param, json: { kind: "Note", name: "Map", body: "The keep", parentId: folder.id } }),
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

  test("refuses a body its route doesn't take, and a document without its file", async () => {
    const { campaign } = await setup();
    const param = { id: campaign.id };
    for (const json of [
      { kind: "Folder", name: "   " },
      { kind: "Scroll", name: "Map" },
      { kind: "Note", name: "Map", visibility: "Hidden" },
      { kind: "Note", name: "Map", readerIds: ["not-a-seat"] },
      // A document is the file its upload sends
      { kind: "Document", name: "Map" },
    ])
      await expectStatus(documents.$post({ param, json: json as never }), 400);
  });

  test("shows a player what admits them, answers a hidden item as an unknown one, and lets them change nothing", async () => {
    const { campaign, player, seat } = await setup();
    const param = { id: campaign.id };
    const shared = await expectOk(
      documents.$post({
        param,
        json: { kind: "Note", name: "Letter", visibility: "Selected", readerIds: [seat.id] },
      }),
    );
    const hidden = await expectOk(documents.$post({ param, json: { kind: "Note", name: "Twist" } }));

    const playerDocuments = player.api.api.campaigns[":id"].documents;
    const seen = await expectOk(playerDocuments.$get({ param }));
    expect(seen.items).toMatchObject([{ id: shared.id, visibility: null, readerIds: null, audience: null }]);
    await expectStatus(playerDocuments[":documentId"].$get({ param: { ...param, documentId: hidden.id } }), 404);
    await expectStatus(playerDocuments.$post({ param, json: { kind: "Note", name: "Mine" } }), 403);
    await expectStatus(playerDocuments[":documentId"].$delete({ param: { ...param, documentId: shared.id } }), 403);
  });

  test("uploads a document, hands its bytes to whoever sees it, and replaces its file", async () => {
    const { campaign, player, seat } = await setup();
    const stored = new Map<string, Uint8Array>();
    ObjectStorage.setForTest(
      fakeStorage({
        putObject: async (key, body) => void stored.set(key, await readBody(body)),
        streamObject: async (key) => streamOf(stored.get(key)),
        deleteObject: async (key) => void stored.delete(key),
      }),
    );
    const param = { id: campaign.id };
    const folder = await expectOk(documents.$post({ param, json: { kind: "Folder", name: "Handouts" } }));
    const upload = documents.upload;
    // In a folder, for one player: its bytes the body, the rest the query's, its seats one parameter each
    const map = await expectOk(
      upload.$post(
        {
          param,
          query: {
            filename: "Bob's map.png",
            name: "  Map  ",
            parentId: folder.id,
            visibility: "Selected",
            readerIds: [seat.id],
          },
        },
        bodyOf(png("Bob's map.png")),
      ),
    );
    const file = { name: "Bob's map.png", contentType: "image/png", byteSize: 64, uploadedAt: expect.any(String) };
    expect(map).toMatchObject({ kind: "Document", name: "Map", parentId: folder.id, readerIds: [seat.id], file });
    // At the top, Private, with no more than its file and its name
    const twist = await expectOk(
      upload.$post({ param, query: { filename: "twist.png", name: "Twist" } }, bodyOf(png("twist.png"))),
    );
    expect(twist).toMatchObject({ parentId: null, visibility: "Private", readerIds: [] });
    await expectOk(document.$put({ param: { ...param, documentId: folder.id }, json: { visibility: "Public" } }));

    const playerDocuments = player.api.api.campaigns[":id"].documents;
    const playerFile = playerDocuments[":documentId"].file;
    const read = await playerFile.$get({ param: { ...param, documentId: map.id } });
    expect(read.status).toBe(200);
    expect(Object.fromEntries(read.headers)).toMatchObject({
      "cache-control": "private, no-store",
      // Its name escaped as RFC 5987 takes it, past what `encodeURIComponent` escapes (a quote mark among them, which a
      // browser reads as its syntax), and an ASCII one for the browsers that read no other
      "content-disposition": `inline; filename="Bob's map.png"; filename*=UTF-8''Bob%27s%20map.png`,
      "content-security-policy": "sandbox",
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
    });
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(new Uint8Array(await png("Bob's map.png").arrayBuffer()));

    // Its file replaced by a text file, read as plain text
    const letter = new File(["Meet me at the old mill."], "letter.txt", { type: "text/plain" });
    const replaced = await expectOk(
      document.file.$put({ param: { ...param, documentId: map.id }, query: { filename: letter.name } }, bodyOf(letter)),
    );
    expect(replaced).toMatchObject({ name: "letter.txt", contentType: "text/plain" });
    const text = await playerFile.$get({ param: { ...param, documentId: map.id } });
    expect(text.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await text.text()).toBe("Meet me at the old mill.");

    // Then by a Word document, which no browser shows: downloaded, under its name
    const docx = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], "Prep.docx");
    await expectOk(
      document.file.$put({ param: { ...param, documentId: map.id }, query: { filename: docx.name } }, bodyOf(docx)),
    );
    const word = await playerFile.$get({ param: { ...param, documentId: map.id } });
    expect(Object.fromEntries(word.headers)).toMatchObject({
      "content-disposition": `attachment; filename="Prep.docx"; filename*=UTF-8''Prep.docx`,
      "content-type": WORD_DOCUMENT_TYPE,
    });

    // A hidden document's file is an unknown one's, and a player uploads and changes none
    await expectStatus(playerFile.$get({ param: { ...param, documentId: twist.id } }), 404);
    await expectStatus(
      playerDocuments.upload.$post({ param, query: { filename: "mine.png", name: "Mine" } }, bodyOf(png("mine.png"))),
      403,
    );
    await expectStatus(
      playerFile.$put(
        { param: { ...param, documentId: map.id }, query: { filename: "mine.png" } },
        bodyOf(png("mine.png")),
      ),
      403,
    );

    // A form without its file or its name; a file past what a document takes, and past what the route reads at all
    await expectStatus(upload.$post({ param, query: { name: "Map" } as never }, bodyOf(png("map.png"))), 400);
    await expectStatus(upload.$post({ param, query: { filename: "map.png" } as never }, bodyOf(png("map.png"))), 400);
    for (const size of [MAX_DOCUMENT_FILE_BYTES + 1, MAX_DOCUMENT_FILE_BYTES + 128 * 1024]) {
      await expectStatus(
        upload.$post({ param, query: { filename: "big.png", name: "Big" } }, bodyOf(png("big.png", size))),
        400,
      );
    }
    expect(stored.size).toBe(2);
  });
});
