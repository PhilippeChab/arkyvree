import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Activities, Characters, Visibility } from "@/server/repositories/index.ts";
import { getSlotUrl } from "@/server/services/attachments/index.ts";
import { readCharacterInput, readChildInputs } from "@/server/services/characters/characterInputs.ts";
import { SHARE_LINK_PERMISSIONS } from "@/server/services/characters/characterPermissions.ts";
import { renderCharacterSheet } from "@/server/services/characters/printedSheet.ts";
import { withLockedCharacter } from "@/server/services/writes/index.ts";
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
    return await withLockedCharacter(session, characterId, async (tx, policy) => {
      // Archived or not: its policy refuses an archived one as an unknown one
      policy.canShare();

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

  /**
   * A shared character's sheet, without its private notes: its token is the one its reader sent, and what they may do
   * with it nothing (`SHARE_LINK_PERMISSIONS`), whoever they are.
   */
  async getSharedCharacter(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) throw new NotFoundError("Character not found");

    const portraitUrl = await getSlotUrl("portrait", characterRecord.id);
    return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, characterRecord);
      const children = await readChildInputs(db, character, Visibility.All);
      const described = Engine.for(scope).character(character).describe(children, "hide");
      return { ...described, permissions: SHARE_LINK_PERMISSIONS, portraitUrl, shareToken };
    });
  }

  async revokeShareToken(session: Session, characterId: string) {
    return await withLockedCharacter(session, characterId, async (tx, policy) => {
      // Archived or not: its policy refuses an archived one as an unknown one
      policy.canShare();

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
