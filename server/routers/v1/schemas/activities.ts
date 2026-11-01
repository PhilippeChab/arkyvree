/** What the key's user did, and what they're told of, as v1 answers it: their activities, and what each is about. */

import { z } from "zod";

import { buildPageSchema, v1Id } from "./references.ts";

/** What an activity or a notification is about: a record, by its kind and its id. */
export const v1Target = z
  .strictObject({
    id: v1Id,
    kind: z.string().meta({
      description:
        "The record's kind, as v1's routes name it (`characters`, `campaigns`, `rulesets`, an entity's kind, `exports`…), or " +
        "its table where no v1 route reads it for everyone a notice of it goes to (`invites`, `contributors`, " +
        "`player_characters`…), its id then the app's (a campaign character's PDF notice names the character's)",
    }),
  })
  .meta({ description: "A record an activity or a notification is about", id: "Target" });

export const v1Activity = z
  .strictObject({
    createdAt: z.string(),
    data: z
      .record(z.string(), z.unknown())
      .nullable()
      .meta({ description: "What it did, by its type: the names and ids the app's activity log reads" }),
    id: v1Id,
    target: v1Target,
    type: z.string().meta({ description: "What the user did: `createCampaign`, `linkCharacter`, `generatePdf`…" }),
  })
  .meta({ description: "Something the key's user did", id: "Activity" });

export const v1ActivityPage = buildPageSchema(v1Activity);
