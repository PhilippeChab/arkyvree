import { Engine } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/**
 * The PCGen characters the import's tests read (`tests/support/dnd3.5/pcgen/`), saved by PCGen 6.09 from the public
 * 3.5 SRD data: a human fighter 6 / rogue 2 who uses a bastard sword; a dwarf cleric 5 of the Strength and Protection
 * domains, whose file records a change to her Constitution at a level the rules give no increase, and the spells she
 * prepared for the day; and a human sorcerer 4 with the ten spells she chose to know.
 */
export type PcgenCharacter = "brannoc" | "hilda" | "selene";

/** What importing a file (`text`) into a ruleset (the seeded one, unless given) plans, as the seed user's. */
export async function planImportOf(text: string, rulesetId?: string) {
  const id = rulesetId ?? (await getSeedCtx()).rulesetId;
  return await withRulesetScope(db, id, async (scope) =>
    Engine.for(scope).characters().planImport(text, { characterId: crypto.randomUUID(), userId: SEED_USER_ID }),
  );
}

/** A PCGen character's file, as its text. */
export async function readPcgenFile(name: PcgenCharacter) {
  return await Bun.file(new URL(`./pcgen/${name}.pcg`, import.meta.url)).text();
}
