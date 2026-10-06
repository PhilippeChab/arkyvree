import aldric from "@/database/seeds/characters/aldric.ts";
import bjorn from "@/database/seeds/characters/bjorn.ts";
import elara from "@/database/seeds/characters/elara.ts";
import fenn from "@/database/seeds/characters/fenn.ts";
import grak from "@/database/seeds/characters/grak.ts";
import kael from "@/database/seeds/characters/kael.ts";
import lyra from "@/database/seeds/characters/lyra.ts";
import melody from "@/database/seeds/characters/melody.ts";
import rowan from "@/database/seeds/characters/rowan.ts";
import theron from "@/database/seeds/characters/theron.ts";
import vex from "@/database/seeds/characters/vex.ts";
import zen from "@/database/seeds/characters/zen.ts";
import { seedCharacter } from "@/database/seeds/seedCharacter.ts";
import { getSeedContext } from "@/database/seeds/seedContext.ts";
import type { Db } from "@/server/database/index.ts";

/** The seed user's characters on the core rules. */
export const CHARACTERS = [bjorn, grak, lyra, zen, kael, elara, vex, theron, melody, rowan, aldric, fenn];

export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);
  for (const character of CHARACTERS) await seedCharacter(db, ctx, character);
}
