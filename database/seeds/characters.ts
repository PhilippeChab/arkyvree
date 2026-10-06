import aldric from "@/database/seeds/aldric.ts";
import bjorn from "@/database/seeds/bjorn.ts";
import elara from "@/database/seeds/elara.ts";
import fenn from "@/database/seeds/fenn.ts";
import grak from "@/database/seeds/grak.ts";
import kael from "@/database/seeds/kael.ts";
import lyra from "@/database/seeds/lyra.ts";
import melody from "@/database/seeds/melody.ts";
import rowan from "@/database/seeds/rowan.ts";
import { seedCharacter } from "@/database/seeds/seedCharacter.ts";
import { getSeedContext } from "@/database/seeds/seedContext.ts";
import theron from "@/database/seeds/theron.ts";
import vex from "@/database/seeds/vex.ts";
import zen from "@/database/seeds/zen.ts";
import type { Db } from "@/server/database/index.ts";

/** The seed user's characters on the core rules. */
export const CHARACTERS = [bjorn, grak, lyra, zen, kael, elara, vex, theron, melody, rowan, aldric, fenn];

export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);
  for (const character of CHARACTERS) await seedCharacter(db, ctx, character);
}
