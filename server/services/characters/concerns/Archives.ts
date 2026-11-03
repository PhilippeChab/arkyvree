import type { Constructor } from "@/lib/mixins.ts";
import { InternalError } from "@/server/errors/index.ts";
import { Activities, Characters, PlayerCharacters } from "@/server/repositories/index.ts";
import { withLockedCharacter } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

/** Archiving a character, bringing it back, and deleting it for good. */
export function Archives<B extends Constructor>(Base: B) {
  abstract class Archiving extends Base {
    async archiveCharacter(session: Session, characterId: string) {
      // Archived or not: its policy refuses an archived one
      return await withLockedCharacter(session, characterId, async (tx, policy) => {
        // Its owner's alone, and a player character's: a child (3.5's bonded creatures) follows its parent
        policy.canArchive();

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
      // Archived or not: its policy refuses a live one
      return await withLockedCharacter(session, characterId, async (tx, policy) => {
        const inActiveCampaign = await PlayerCharacters.exists(tx, { characterId, campaignArchived: false });
        policy.canHardDelete({ inActiveCampaign });

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
      });
    }

    async unarchiveCharacter(session: Session, characterId: string) {
      // Archived or not: its policy refuses a live one
      return await withLockedCharacter(session, characterId, async (tx, policy) => {
        policy.canUnarchive();

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
      });
    }
  }
  return Archiving;
}
