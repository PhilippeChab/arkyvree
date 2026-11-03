import { CHARACTERS } from "@/content/dnd3.5/testData/characters.ts";
import type { Db } from "@/drizzle/database.ts";

import { getSeedContext } from "./seedContext.ts";

/**
 * Seeds the seed user's 3.5 characters on the 3.5 core rules (`CHARACTERS`), in their order. A character is written
 * as the server writes one (`seedCharacter`), which loads the server: it's imported here, when the seeds run, so the
 * registry that names this, and the runner that reads the registry (the release's migrate), load none of it.
 */
export async function seedTestCharacters(db: Db) {
  const { seedCharacter } = await import("./seedCharacter.ts");
  const ctx = await getSeedContext(db);
  for (const character of CHARACTERS) await seedCharacter(db, ctx, character);
}
