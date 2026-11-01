/** What the key's user is told of, as v1 answers it: a page of their notifications. */

import { z } from "zod";

import { v1Target } from "./activities.ts";
import { buildPageSchema, v1Id } from "./references.ts";

export const v1Notification = z
  .strictObject({
    createdAt: z.string(),
    data: z
      .record(z.string(), z.unknown())
      .nullable()
      .meta({
        description:
          "What it tells, by its type: a ready PDF's `exportId` and `fileName`, an invite's campaign or ruleset, the " +
          "names the app's bell reads",
      }),
    id: v1Id,
    read: z.boolean(),
    target: v1Target,
    type: z.string().meta({
      description:
        "What happened: `pdfReady`, `pdfFailed`, an invite (`createCampaignInvite`, `inviteContributor`, " +
        "`inviteCharacterContributor`), which stays unread until it's answered…",
    }),
  })
  .meta({ description: "Something the key's user is told of", id: "Notification" });

export const v1NotificationPage = buildPageSchema(v1Notification);
