/** A character's or a ruleset's contributors as v1 answers them: each by the address they were invited at. */

import { z } from "zod";

import { contributorRole } from "@/drizzle/schema.ts";

import { v1Id } from "./references.ts";
import { v1User } from "./users.ts";

export const v1Contributor = z
  .strictObject({
    email: z.string().meta({ description: "The address they were invited at" }),
    id: v1Id.meta({ description: "The contributor's own id, which its routes take: its invite's" }),
    role: z
      .enum(contributorRole.enumValues)
      .meta({ description: "What they may do: a ruleset's `Admin`, `Editor` or `Viewer`; a character's `Editor`" }),
    status: z.string().meta({ description: "`Pending` until they answer, `Active` once they accept" }),
    userId: v1Id.nullable().meta({ description: "Their user, none while the address has no account" }),
  })
  .meta({ description: "A contributor of a character's or a ruleset's, or an invite to be one", id: "Contributor" });

export const v1ContributorPage = z
  .strictObject({
    items: z.array(v1Contributor),
    nextPage: z.number().int().nullable().meta({ description: "The next page's number, null on the last" }),
    owner: v1User
      .nullable()
      .meta({ description: "Its owner, who isn't one of its contributors: none for the app's own" }),
    page: z.number().int(),
  })
  .meta({ description: "A page of Contributor items, with the owner they contribute with", id: "ContributorPage" });
