import type { Db } from "@/drizzle/database.ts";
import { withUniqueRefusal } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";

/** The unique index that keeps a ruleset's name its own (`drizzle/schema.ts`). */
const NAME_INDEX = "rulesets_name_unique_idx";

/** The refusal of a name another ruleset holds, whichever path asks. */
function toNameTakenError() {
  return new ConflictError("A ruleset with this name already exists");
}

/**
 * Refuses a name another ruleset holds: a name is unique across every user's rulesets, a private, an archived or an
 * orphaned one's too (`rulesets_name_unique_idx`), whether a fork or an edit asks.
 */
export async function assertNameFree(tx: Db, name: string) {
  if (await Rulesets.findOne(tx, { name })) throw toNameTakenError();
}

/**
 * Runs `write`, which sets a ruleset's name, answering the name index's refusal as `assertNameFree` does: two requests
 * that claim one name at once both pass the check, and the second one's write meets the index.
 */
export async function withNameRefusal<T>(write: () => Promise<T>) {
  return await withUniqueRefusal(write, (index) => (index === NAME_INDEX ? toNameTakenError() : undefined));
}
