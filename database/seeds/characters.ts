import { CHARACTERS } from "@/content/dnd3.5/testData/characters.ts";
import type { Db } from "@/server/database/index.ts";

import { seedCharacter } from "./seedCharacter.ts";
import { getSeedContext } from "./seedContext.ts";

/** Seeds the seed user's characters on the core rules (`CHARACTERS`), in their order. */
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);
  for (const character of CHARACTERS) await seedCharacter(db, ctx, character);
}
