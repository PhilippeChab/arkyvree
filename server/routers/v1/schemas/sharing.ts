/** A character's share link as v1 answers it: the token anyone reads the character by. */

import { z } from "zod";

import { v1Id } from "./references.ts";

export const v1ShareLink = z
  .strictObject({
    shareToken: v1Id.nullable().meta({
      description: "What reads the character, `GET /v1/shared-characters/{shareToken}`: none once it's revoked",
    }),
  })
  .meta({ description: "A character's share link, which a new one replaces", id: "ShareLink" });
