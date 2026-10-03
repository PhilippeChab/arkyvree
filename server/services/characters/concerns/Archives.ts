import { getTableName } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { withTransaction } from "@/server/database/index.ts";
import { InternalError, NotFoundError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Activities, Characters } from "@/server/repositories/index.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/** Archiving a character, bringing it back, and deleting it for good. */
export function Archives<B extends Constructor>(Base: B) {
  abstract class Archiving extends Base {
    async archiveCharacter(session: Session, characterId: string) {
      return await withTransaction(async (tx) => {
        const existingCharacter = await Characters.findOne(tx, {
          id: characterId,
          userId: session.userId,
        });

        if (!existingCharacter || existingCharacter.kind !== "pc") {
          throw new NotFoundError("Character not found");
        }

        // Archive flips deletedAt on the character row only — level/inventory/
        // language children stay live. They're unreachable once the parent is
        // hidden from the list, and keeping them live makes archive/unarchive
        // symmetric: the unarchive un-cascade below is a no-op for characters
        // archived this way, and still repairs legacy cascade-archived rows.
        const rows = await Characters.archive(tx, { id: characterId });
        const archivedCharacter = rows[0];

        if (!archivedCharacter) {
          throw new InternalError("Failed to archive character");
        }

        await Activities.create(tx, {
          userId: session.userId,
          targetId: archivedCharacter.id,
          targetTable: getTableName(charactersInCharacter),
          type: "archiveCharacter",
        });

        return archivedCharacter;
      });
    }

    async hardDeleteCharacter(session: Session, characterId: string) {
      return await withTransaction(async (tx) => {
        const existingCharacter = await Characters.findOne(
          tx,
          { id: characterId, userId: session.userId },
          Visibility.ArchivedOnly,
        );

        if (!existingCharacter || existingCharacter.kind !== "pc") {
          throw new NotFoundError("Character not found");
        }

        await new CharactersPolicy(session, existingCharacter).canHardDelete();

        // Bonded children cascade via FK on delete, and the database deletes
        // their attachments and modifiers with them.
        await Characters.delete(tx, { id: characterId });

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(charactersInCharacter),
          type: "hardDeleteCharacter",
        });

        return { id: characterId };
      });
    }

    async unarchiveCharacter(session: Session, characterId: string) {
      return await withTransaction(async (tx) => {
        const existingCharacter = await Characters.findOne(
          tx,
          {
            id: characterId,
            userId: session.userId,
          },
          Visibility.ArchivedOnly,
        );

        if (!existingCharacter || existingCharacter.kind !== "pc") {
          throw new NotFoundError("Character not found");
        }

        const rows = await Characters.unarchive(tx, { id: characterId });
        const unarchivedCharacter = rows[0];

        if (!unarchivedCharacter) {
          throw new InternalError("Failed to unarchive character");
        }

        await Activities.create(tx, {
          userId: session.userId,
          targetId: unarchivedCharacter.id,
          targetTable: getTableName(charactersInCharacter),
          type: "unarchiveCharacter",
        });

        return unarchivedCharacter;
      });
    }
  }
  return Archiving;
}
