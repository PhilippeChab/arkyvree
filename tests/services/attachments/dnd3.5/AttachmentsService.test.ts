import { describe, expect, test } from "bun:test";

import { ForbiddenError } from "@/server/errors/index.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestUser } from "@/tests/support/users.ts";

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

    expect(AttachmentsService.createDirectUpload(session, portraitOf(character.id))).rejects.toThrow(ForbiddenError);
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
    expect(AttachmentsService.createDirectUpload(other, portraitOf(familiar.id))).rejects.toThrow(ForbiddenError);
  });
});
