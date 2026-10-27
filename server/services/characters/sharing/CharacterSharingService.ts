import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Activities, Characters, Visibility } from "@/server/repositories/index.ts";
import { getSlotUrl } from "@/server/services/attachments/index.ts";
import { readCharacterInput, readChildInputs } from "@/server/services/characters/characterInputs.ts";
import { renderCharacterSheet } from "@/server/services/characters/printedSheet.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

class CharacterSharingService {
  /** A shared character's printed sheet as a PDF file, read as its share page is: without its private notes. */
  async generateSharedPdf(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) throw new NotFoundError("Character not found");

    return await renderCharacterSheet(characterRecord, "hide");
  }

  async generateShareToken(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOne(tx, { id: characterId });
      if (!characterRecord) throw new NotFoundError("Character not found");

      (await CharactersPolicy.for(tx, session, characterRecord)).canShare();

      const shareToken = crypto.randomUUID();
      const [updated] = await Characters.update(tx, { shareToken }, { id: characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "generateShareToken",
      });

      return updated;
    });
  }

  /** A shared character's sheet, without its private notes: its token is the one its reader sent. */
  async getSharedCharacter(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) throw new NotFoundError("Character not found");

    const portraitUrl = await getSlotUrl("portrait", characterRecord.id);
    return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, characterRecord);
      const children = await readChildInputs(db, character, Visibility.All);
      return { ...Engine.for(scope).character(character).describe(children, "hide"), shareToken, portraitUrl };
    });
  }

  async revokeShareToken(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOne(tx, { id: characterId });
      if (!characterRecord) throw new NotFoundError("Character not found");

      (await CharactersPolicy.for(tx, session, characterRecord)).canShare();

      const [updated] = await Characters.update(tx, { shareToken: null }, { id: characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "revokeShareToken",
      });

      return updated;
    });
  }
}

export default new CharacterSharingService();
