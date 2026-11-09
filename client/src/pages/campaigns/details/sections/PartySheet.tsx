import { useQuery } from "@tanstack/react-query";

import { CompactSheet } from "@/client/src/components/characters/index.ts";
import { DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import { campaignCharacterQuery } from "@/client/src/pages/campaigns/campaignQueries.ts";

interface PartySheetProps {
  campaignId: string;
  characterId: string;
}

/**
 * A campaign character's sheet in brief, on its card in the Party View: the sheet the campaign shows its members (a
 * partly seen one's, its identity alone), which its page opens on from the cache.
 */
export function PartySheet({ campaignId, characterId }: PartySheetProps) {
  const { data, error, isLoading, refetch } = useQuery(campaignCharacterQuery(campaignId, characterId));

  if (isLoading) return <DiceSpinner sx={{ py: 4 }} />;
  if (!data) return <LoadError what="Character Sheet" error={error} onRetry={() => void refetch()} />;
  return <CompactSheet blocks={data.blocks} />;
}
