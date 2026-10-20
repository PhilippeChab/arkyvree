/** The key's user's dashboard as v1 answers it: how many of each record they have. */

import { z } from "zod";

export const v1Stats = z
  .strictObject({
    campaigns: z.number().int().meta({ description: "The live campaigns they're a player of, or the Game Master" }),
    characters: z.number().int().meta({ description: "Their live player characters" }),
    rulesets: z
      .number()
      .int()
      .meta({ description: "The live rulesets they own or contribute to, and the app's own published ones" }),
  })
  .meta({ description: "How many campaigns, characters and rulesets the key's user has", id: "Stats" });
