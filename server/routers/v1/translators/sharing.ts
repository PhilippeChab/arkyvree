/** A character's share link as v1 answers it: the token anyone reads it by. */

import type { z } from "zod";

import type { v1ShareLink } from "@/server/routers/v1/schemas/sharing.ts";
import type { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

/** What a service answers, awaited. */
type Answer<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;

/** A character's share link, as its making or its revoking leaves it. */
export function toV1ShareLink({
  shareToken,
}:
  | Answer<typeof CharacterSharingService.generateShareToken>
  | Answer<typeof CharacterSharingService.revokeShareToken>): z.infer<typeof v1ShareLink> {
  return { shareToken };
}
