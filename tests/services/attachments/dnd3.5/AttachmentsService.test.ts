import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A PNG's first bytes, which name its type, then 64 bytes in all. */
function png() {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], "portrait.png", { type: "image/png" });
}

/** A portrait's upload, of a character (`characterId`). */
function portraitOf(characterId: string) {
  return {
    recordType: "Character",
    recordId: characterId,
    name: "portrait",
    filename: "char.png",
    contentType: "image/png",
    byteSize: 2048,
  };
}

describe("AttachmentsService: a character's portrait", () => {
  test("a player character's contributor is refused its portrait", async () => {
    const { user: owner } = await createTestUser();
    const { user: contributor, session } = await createTestUser();
    const character = await createTestCharacter(owner.id);
    await addCharacterContributor(character.id, contributor, owner.id);

    expect(AttachmentsService.createDirectUpload(session, portraitOf(character.id))).rejects.toEqual(
      new ForbiddenError("Only the owner can change the portrait"),
    );
  });

  test("a bonded creature's is whoever edits its master's, a contributor among them", async () => {
    const { user: owner } = await createTestUser();
    const { user: contributor, session } = await createTestUser();
    const { session: other } = await createTestUser();
    const master = await createTestCharacter(owner.id);
    const familiar = await createTestCharacter(owner.id, { kind: "familiar", parentCharacterId: master.id });
    await addCharacterContributor(master.id, contributor, owner.id);

    const upload = await AttachmentsService.createDirectUpload(session, portraitOf(familiar.id));
    expect(upload.signedId).toEqual(expect.any(String));
    expect(AttachmentsService.createDirectUpload(other, portraitOf(familiar.id))).rejects.toEqual(
      new NotFoundError("Character not found"),
    );
  });

  test("an archived character's is refused on its state, by its policy: an upload, an attach and a removal", async () => {
    const { user: owner, session } = await createTestUser();
    const { session: stranger } = await createTestUser();
    const character = await createTestCharacter(owner.id);
    const { id } = await AttachmentsService.setAttachment(session, "Character", character.id, "portrait", png());
    const direct = await AttachmentsService.createDirectUpload(session, portraitOf(character.id));
    await Characters.archive(db, { id: character.id });

    const archived = new ConflictError("This character is archived");
    expect(AttachmentsService.createDirectUpload(session, portraitOf(character.id))).rejects.toEqual(archived);
    expect(AttachmentsService.setAttachment(session, "Character", character.id, "portrait", png())).rejects.toEqual(
      archived,
    );
    expect(AttachmentsService.attach(session, direct.signedId)).rejects.toEqual(archived);
    expect(AttachmentsService.detach(session, id)).rejects.toEqual(archived);
    // Who's asking comes first: a stranger gets the 404 an unknown character gets
    expect(AttachmentsService.detach(stranger, id)).rejects.toEqual(new NotFoundError("Character not found"));
  });
});
