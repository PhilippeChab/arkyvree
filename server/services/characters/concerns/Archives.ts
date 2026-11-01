import type { Constructor } from "@/lib/mixins.ts";
import { InternalError, NotFoundError } from "@/server/errors/index.ts";
import { Activities, Characters, PlayerCharacters, Visibility } from "@/server/repositories/index.ts";
import { withCharacterLock } from "@/server/services/characters/characterWrites.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

/** Archiving a character, bringing it back, and deleting it for good. */
export function Archives<B extends Constructor>(Base: B) {
  abstract class Archiving extends Base {
    async archiveCharacter(session: Session, characterId: string) {
      return await withCharacterLock(characterId, async (tx) => {
        const existingCharacter = await Characters.findOne(tx, { id: characterId });
        if (!existingCharacter) throw new NotFoundError("Character not found");

        // Its owner's alone, and a player character's: a child (3.5's bonded creatures) follows its parent
        (await CharactersPolicy.for(tx, session, existingCharacter)).canArchive();

        // Archive sets deletedAt on the character's row and on its child characters' (3.5's bonded creatures), and
        // unarchive clears both. Its own rows (its levels and their picks, its links, its inventory) have no archive:
        // they stay as they are, out of reach while the character is hidden.
        const rows = await Characters.archive(tx, { id: characterId });
        const archivedCharacter = rows[0];

        if (!archivedCharacter) throw new InternalError("Failed to archive character");

        await Activities.create(tx, {
          userId: session.userId,
          targetId: archivedCharacter.id,
          targetType: TARGET_TYPES.characters,
          type: "archiveCharacter",
        });

        return archivedCharacter;
      });
    }

    async hardDeleteCharacter(session: Session, characterId: string) {
      return await withCharacterLock(
        characterId,
        async (tx) => {
          // Archived or not: its policy refuses a live one
          const existingCharacter = await Characters.findOne(tx, { id: characterId }, Visibility.All);
          if (!existingCharacter) throw new NotFoundError("Character not found");

          const inActiveCampaign = await PlayerCharacters.exists(tx, { characterId, campaignArchived: false });
          (await CharactersPolicy.for(tx, session, existingCharacter)).canHardDelete({ inActiveCampaign });

          // Children (3.5's bonded creatures) cascade via FK on delete, and the database deletes
          // their attachments and modifiers with them.
          await Characters.delete(tx, { id: characterId });

          await Activities.create(tx, {
            userId: session.userId,
            targetId: characterId,
            targetType: TARGET_TYPES.characters,
            type: "hardDeleteCharacter",
          });

          return { id: characterId };
        },
        Visibility.All,
      );
    }

    async unarchiveCharacter(session: Session, characterId: string) {
      return await withCharacterLock(
        characterId,
        async (tx) => {
          const existingCharacter = await Characters.findOne(tx, { id: characterId }, Visibility.ArchivedOnly);
          if (!existingCharacter) throw new NotFoundError("Character not found");

          (await CharactersPolicy.for(tx, session, existingCharacter)).canArchive();

          const rows = await Characters.unarchive(tx, { id: characterId });
          const unarchivedCharacter = rows[0];

          if (!unarchivedCharacter) throw new InternalError("Failed to unarchive character");

          await Activities.create(tx, {
            userId: session.userId,
            targetId: unarchivedCharacter.id,
            targetType: TARGET_TYPES.characters,
            type: "unarchiveCharacter",
          });

          return unarchivedCharacter;
        },
        Visibility.ArchivedOnly,
      );
    }
  }
  return Archiving;
}
