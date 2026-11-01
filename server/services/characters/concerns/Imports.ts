import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { Activities, CharacterInventory } from "@/server/repositories/index.ts";
import { withCharacterCreate } from "@/server/services/characters/characterWrites.ts";
import { createAdvancement, writeChildren } from "@/server/services/characters/levels/index.ts";
import { createNewCharacter } from "@/server/services/characters/newCharacterWrites.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

/** Importing a character from another program's file into a ruleset, and what such a file is before one is picked. */
export function Imports<B extends Constructor>(Base: B) {
  abstract class Importing extends Base {
    /**
     * What a character file another program saved is (`text`), before a ruleset is picked: the program that saved it,
     * its version, the file's format and its character's rules, the base rules whose rulesets import it, and why none
     * does.
     */
    getImportSource(text: string) {
      return Engine.imports().describeFile(text);
    }

    /**
     * Creates the character another program's file holds (`text`) in a ruleset the session may create characters in, as
     * the engine plans it (by the ruleset's importer that reads the file): its row, ability scores and languages, its
     * levels as if leveled up one at a time, its inventory and its children (3.5's bonded creatures). Answers the
     * character, and the report of what was imported and every line of the file that couldn't be. Planned in the
     * transaction that writes it, as a level-up's save is, so the ruleset's view it's planned against is the one it's
     * written in (a second or so for a high-level character, which the route's rate limit bounds).
     */
    async importCharacter(session: Session, rulesetId: string, text: string) {
      return await withCharacterCreate(session, rulesetId, async (tx, scope, policy) => {
        policy.canCreateCharacter();
        const characterId = crypto.randomUUID();
        const plan = Engine.for(scope).characters().planImport(text, { characterId, userId: session.userId });
        const character = await createNewCharacter(tx, {
          links: plan.links,
          row: { ...plan.row, id: characterId, rulesetId, userId: session.userId },
        });
        for (const advancement of plan.advancements) await createAdvancement(tx, characterId, advancement);
        await CharacterInventory.createMany(
          tx,
          plan.inventory.map((entry) => ({ ...entry, characterId })),
        );
        await writeChildren(tx, character, plan.children);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetType: TARGET_TYPES.characters,
          type: "createCharacter",
        });

        return { character, report: plan.report };
      });
    }
  }
  return Importing;
}
