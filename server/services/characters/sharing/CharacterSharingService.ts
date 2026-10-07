import { getTableName } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { describeCharacter } from "@/engine/index.ts";
import type { CharacterKind } from "@/engine/rulesets/dnd3.5/index.ts";
import { readBondedInputs, readCharacterInput } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Activities, Characters, Visibility } from "@/server/repositories/index.ts";
import { getSlotUrl } from "@/server/services/attachments/index.ts";
import { buildCharacterSheet } from "@/server/sheets/index.ts";
import type { Session } from "@/shared/relations.ts";

class CharacterSharingService {
  async generateSharedPdf(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) throw new NotFoundError("Character not found");

    const { detailedCharacter, CharacterSheetComponent } = await buildCharacterSheet(characterRecord);

    const portraitUrl = await getSlotUrl("Character", characterRecord.id, "portrait");

    return {
      detailedCharacter,
      CharacterSheetComponent,
      portraitUrl,
      kind: characterRecord.kind as CharacterKind,
    };
  }

  async generateShareToken(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOne(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!characterRecord || characterRecord.kind !== "pc") throw new NotFoundError("Character not found");

      const shareToken = crypto.randomUUID();
      const [updated] = await Characters.update(tx, { shareToken }, { id: characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(charactersInCharacter),
        type: "generateShareToken",
      });

      return updated;
    });
  }

  async getSharedCharacter(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) throw new NotFoundError("Character not found");

    const portraitUrl = await getSlotUrl("Character", characterRecord.id, "portrait");
    return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => ({
      ...describeCharacter(
        scope,
        await readCharacterInput(db, characterRecord),
        await readBondedInputs(db, characterRecord, Visibility.All),
        "omit",
      ),
      portraitUrl,
    }));
  }

  async revokeShareToken(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOne(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!characterRecord || characterRecord.kind !== "pc") throw new NotFoundError("Character not found");

      const [updated] = await Characters.update(tx, { shareToken: null }, { id: characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(charactersInCharacter),
        type: "revokeShareToken",
      });

      return updated;
    });
  }
}

export default new CharacterSharingService();
