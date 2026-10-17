import { getTableName } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import {
  Activities,
  CharacterAbilities,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevels,
  Characters,
} from "@/server/repositories/index.ts";
import { createLevelRows, writeBondedCreatures } from "@/server/services/characters/levels/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/** Importing a character from another program's file into a ruleset, and which programs a ruleset imports from. */
export function Imports<B extends Constructor>(Base: B) {
  abstract class Importing extends Base {
    /** The programs whose files a ruleset (`rulesetId`) imports characters from, as its rules answer it. */
    async getImporters(rulesetId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).characters().describeImporters());
    }

    /**
     * Creates the character another program's file holds (`text`) in a ruleset the session may create characters in,
     * as the engine plans it (by the ruleset's importer that reads the file): its row, ability scores and languages,
     * its levels as if leveled up one at a time, its inventory and its bonded creatures. Answers the character, and the
     * report of what was imported and every line of the file that couldn't be. Planned in the transaction that writes
     * it, as a level-up's save is, so the ruleset's view it's planned against is the one it's written in (a second or
     * so for a high-level character, which the route's rate limit bounds).
     */
    async importCharacter(session: Session, rulesetId: string, text: string) {
      return await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            (await RulesetsPolicy.for(tx, session, scope.ruleset)).canCreateCharacter();
            const characterId = crypto.randomUUID();
            const plan = Engine.for(scope).characters().planImport(text, { characterId, userId: session.userId });
            const [character] = await Characters.create(tx, {
              ...plan.character,
              id: characterId,
              rulesetId,
              userId: session.userId,
            });
            await CharacterAbilities.createMany(
              tx,
              plan.abilities.map((ability) => ({ characterId, ...ability })),
            );
            for (const { columns, rows } of plan.levels) {
              const [level] = await CharacterLevels.create(tx, { characterId, ...columns });
              await createLevelRows(tx, level.id, rows);
            }
            await CharacterLanguages.createMany(
              tx,
              plan.languageIds.map((languageId) => ({ characterId, languageId })),
            );
            await CharacterInventory.createMany(
              tx,
              plan.inventory.map((entry) => ({ characterId, ...entry })),
            );
            await writeBondedCreatures(tx, character, plan.bonded);

            await Activities.create(tx, {
              userId: session.userId,
              targetId: characterId,
              targetTable: getTableName(charactersInCharacter),
              type: "createCharacter",
            });

            return { character, report: plan.report };
          }),
      );
    }
  }
  return Importing;
}
