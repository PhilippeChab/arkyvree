import { getTableName } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Activities, Characters } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { CharacterKind } from "@/server/rulesets/types.ts";
import { urlForSlot } from "@/server/services/attachments/index.ts";
import { loadBondedByKind } from "@/server/services/characters/bonded.ts";
import type { Session } from "@/shared/relations.ts";

class CharacterSharingService {
  async generateShareToken(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOne(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!characterRecord || characterRecord.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

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

  async revokeShareToken(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOne(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!characterRecord || characterRecord.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

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

  async getSharedCharacter(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build();

    const bondedByKind = await loadBondedByKind(rulesetModule, characterRecord.id);
    const portraitUrl = await urlForSlot("Character", characterRecord.id, "portrait");

    return {
      character: characterRecord,
      detailedCharacter,
      bondedByKind,
      portraitUrl,
    };
  }

  async generateSharedPdf(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
    const { detailedCharacter, CharacterSheetComponent } =
      await rulesetModule.createDetailedCharacterWithSheet(characterRecord);

    const portraitUrl = await urlForSlot("Character", characterRecord.id, "portrait");

    return {
      detailedCharacter,
      CharacterSheetComponent,
      portraitUrl,
      kind: characterRecord.kind as CharacterKind,
    };
  }
}

export default new CharacterSharingService();
