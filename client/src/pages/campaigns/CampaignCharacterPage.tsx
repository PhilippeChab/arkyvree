import { Menu } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  CharacterDetailSkeleton,
  CharacterHeader,
  CharacterSheetBody,
} from "@/client/src/components/characters/index.ts";
import { ActionMenuItem, PageBody, PageError } from "@/client/src/components/common/index.ts";
import { DownloadIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
export default function CampaignCharacterPage() {
  const { id: campaignId = "", characterId = "" } = useParams<{ id: string; characterId: string }>();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.campaigns.characterDetail(campaignId, characterId),
    queryFn: async () => {
      return parseResponse(
        rpc.api.campaigns[":id"].characters[":characterId"]["$get"]({
          param: { id: campaignId, characterId },
        }),
      );
    },
    enabled: !!campaignId && !!characterId,
  });

  const pdfExport = usePdfExport(() =>
    rpc.api.campaigns[":id"].characters[":characterId"]["pdf"]["$post"]({
      param: { id: campaignId, characterId },
    }),
  );

  usePageTitle(data?.identity?.physiology?.name);

  const handleClose = () => setAnchorEl(null);
  const closeMenuAnd = (then: () => void) => () => {
    handleClose();
    then();
  };

  if (isLoading) {
    return <CharacterDetailSkeleton />;
  }

  // A passing refetch failure keeps the loaded sheet; a revoked visibility or unlink hides it.
  if (!data || accessLost(error)) {
    return (
      <PageBody>
        <PageError
          message={loadFailureMessage("Character", error)}
          backLabel="Back to Campaign"
          backTo={`/campaigns/${campaignId}/characters`}
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <CharacterHeader
        name={data.identity?.physiology?.name || ""}
        rulesetName={data.rulesetName}
        backTo={`/campaigns/${campaignId}`}
        onMenuOpen={data.canDownloadPdf && !data.deletedAt ? (e) => setAnchorEl(e.currentTarget) : undefined}
      />
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {data.canEdit && (
          <ActionMenuItem
            icon={EditIcon}
            label="Edit Character"
            onClick={closeMenuAnd(() => navigate(`/characters/${characterId}`))}
          />
        )}
        <ActionMenuItem icon={DownloadIcon} label="Download PDF" onClick={closeMenuAnd(() => pdfExport.mutate())} />
      </Menu>
      <CharacterSheetBody
        character={data}
        characterId={characterId}
        readOnly
        partial={data.isPartial}
        equipmentMode="readonly"
      />
    </PageBody>
  );
}
