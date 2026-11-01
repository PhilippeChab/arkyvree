/** A user as v1 names one: by their id and their username, never their email address or anything of their account. */

import { z } from "zod";

import { v1Id } from "./references.ts";

export const v1User = z
  .strictObject({ id: v1Id, username: z.string().nullable().meta({ description: "None until they choose one" }) })
  .meta({ description: "A user, by their id and their username", id: "User" });
