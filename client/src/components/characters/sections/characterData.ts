import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import type { RPC } from "@/client/src/services/rpc.ts";
import type { InferResponseType } from "hono/client";

type CampaignCharacterData = InferResponseType<RPC["api"]["campaigns"][":id"]["characters"][":characterId"]["$get"], 200>;
type SharedCharacterData = InferResponseType<RPC["api"]["shared"]["characters"][":shareToken"]["$get"], 200>;

/** A character sheet's data: the owner's view, a campaign member's, or a share link's. */
export type CharacterData = CharacterDetail | CampaignCharacterData | SharedCharacterData;
