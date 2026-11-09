import { MenuItem, TextField } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { StatusChip } from "@/client/src/components/common/index.ts";
import { VisibilityIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import type { CampaignCharacter } from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { CHARACTER_VISIBILITY_OPTIONS, type CharacterVisibility } from "@/shared/campaigns.ts";

interface VisibilityControlProps {
  campaignId: string;
  character: CampaignCharacter;
}

/**
 * A campaign character's visibility, on its card: its owner picks it in a select, a chip being a value and never an
 * action; the others read it.
 */
export function VisibilityControl({ campaignId, character }: VisibilityControlProps) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const visibilityMutation = useMutation({
    mutationFn: async (visibility: CharacterVisibility) =>
      parseResponse(
        rpc.api.campaigns[":id"].characters[":characterId"].$put({
          param: { id: campaignId, characterId: character.id },
          json: { visibility },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Visibility updated");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.section(campaignId, "characters") });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.characterDetail(campaignId, character.id) });
    },
    onError: (error) => {
      snackbar.error(error, "Failed to update visibility");
    },
  });

  if (!character.canSetVisibility) return <StatusChip icon={<VisibilityIcon />} label={character.visibility} />;
  return (
    <TextField
      select
      size="small"
      label="Visibility"
      value={character.visibility}
      onChange={(event) =>
        visibilityMutation.mutate(oneOf(event.target.value, CHARACTER_VISIBILITY_OPTIONS, "Private"))
      }
      disabled={visibilityMutation.isPending}
      sx={{ minWidth: 120 }}
    >
      {CHARACTER_VISIBILITY_OPTIONS.map((option) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </TextField>
  );
}
