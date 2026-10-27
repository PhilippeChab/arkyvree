import type { Db } from "@/drizzle/database.ts";
import type { NewCharacterPlan, NewCharacterRow } from "@/engine/index.ts";
import { CharacterLinks, Characters } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * A new character's row as its writer has it whole: its plan's, with its owner, its ruleset and its name, and any other
 * own column its writer sets (its id, its notes, its parent).
 */
type WrittenRow = NewCharacterRow &
  Pick<Character, "name" | "rulesetId" | "userId"> &
  Partial<Pick<Character, "id" | "notes" | "parentCharacterId" | "privateNotes">>;

/**
 * Writes a new character as the engine plans it (`plan`: a create's, an import's, a level's child's), its row whole:
 * the row, with its fields' values and single links, then its links of each role it holds many of (3.5's ability
 * scores, its languages). Answers its row as stored.
 */
export async function createNewCharacter(tx: Db, plan: NewCharacterPlan<WrittenRow>) {
  const [created] = await Characters.create(tx, plan.row);
  for (const [role, links] of Object.entries(plan.links)) await CharacterLinks.createMany(tx, created.id, role, links);
  return created;
}
