import type { InferResponseType } from "hono/client";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type CampaignCharacterData = InferResponseType<
  (typeof rpc.api.campaigns)[":id"]["characters"][":characterId"]["$get"],
  200
>;
type SharedCharacterData = InferResponseType<(typeof rpc.api.shared.characters)[":shareToken"]["$get"], 200>;

/** A character sheet's data: the owner's view, a campaign member's, or a share link's. */
export type CharacterData = CharacterDetail | CampaignCharacterData | SharedCharacterData;
