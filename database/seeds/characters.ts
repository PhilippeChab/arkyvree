import type { Db } from "@/server/database/index.ts";

import aldric from "./characters/aldric.ts";
import bjorn from "./characters/bjorn.ts";
import elara from "./characters/elara.ts";
import fenn from "./characters/fenn.ts";
import grak from "./characters/grak.ts";
import kael from "./characters/kael.ts";
import lyra from "./characters/lyra.ts";
import melody from "./characters/melody.ts";
import rowan from "./characters/rowan.ts";
import theron from "./characters/theron.ts";
import vex from "./characters/vex.ts";
import zen from "./characters/zen.ts";
import { seedCharacter } from "./seedCharacter.ts";
import { getSeedContext } from "./seedContext.ts";

/** The seed user's characters on the core rules. */
export const CHARACTERS = [bjorn, grak, lyra, zen, kael, elara, vex, theron, melody, rowan, aldric, fenn];

export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);
  for (const character of CHARACTERS) await seedCharacter(db, ctx, character);
}
