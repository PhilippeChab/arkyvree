import { Container, Menu, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import {
  CharacterDetailSkeleton,
  CharacterHeader,
  CharacterSheetBody,
} from "@/client/src/components/characters/index.ts";
import { ActionMenuItem, PageError, PageTransition } from "@/client/src/components/common/index.ts";
import { DownloadIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu, usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { campaignDetailQuery } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { campaignCharacterQuery } from "./campaignQueries.ts";
import { useCampaignPermissions } from "./hooks/index.ts";

export default function CampaignCharacterPage() {
  const { id: campaignId = "", characterId = "" } = useParams<{ characterId: string; id: string }>();
  const menu = useAnchorMenu();

  const { data, isLoading, error } = useQuery(campaignCharacterQuery(campaignId, characterId));
  // The viewer's role: the private notes show to the character's editors and the Game Master
  const {
    data: campaign,
    isLoading: campaignLoading,
    error: campaignError,
  } = useQuery(campaignDetailQuery(campaignId));
  const { isDM } = useCampaignPermissions(campaign);

  const exportFn = () =>
    parseResponse(
      rpc.api.campaigns[":id"].characters[":characterId"].pdf.$post({ param: { id: campaignId, characterId } }),
    );
  const pdfExport = usePdfExport(exportFn);

  usePageTitle(data?.identity?.physiology?.name);

  if (isLoading || campaignLoading) return <CharacterDetailSkeleton />;

  // A passing refetch failure keeps the loaded sheet; a revoked visibility or unlink hides it. An address without its
  // ids loads nothing, and says so here too.
  const loadError = error ?? campaignError;
  if (!data || !campaign || accessLost(loadError)) {
    return (
      <Container maxWidth="xl">
        <PageError
          message={loadFailureMessage("Character", loadError)}
          backLabel="Back to Campaign"
          backTo={`/campaigns/${campaignId}/characters`}
        />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <CharacterHeader
            name={data.identity?.physiology?.name ?? ""}
            rulesetName={data.rulesetName}
            backTo={`/campaigns/${campaignId}`}
            onMenuOpen={data.canDownloadPdf && !data.deletedAt ? menu.openMenu : undefined}
          />
          <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
            {data.canEdit && (
              <ActionMenuItem
                icon={EditIcon}
                label="Edit Character"
                to={`/characters/${characterId}`}
                onClick={menu.closeMenu}
              />
            )}
            <ActionMenuItem
              icon={DownloadIcon}
              label="Download PDF"
              onClick={menu.closeMenuAnd(() => pdfExport.mutate())}
            />
          </Menu>
          <CharacterSheetBody
            character={data}
            characterId={characterId}
            readOnly
            partial={data.isPartial}
            equipmentMode="readonly"
            showPrivateNotes={data.canEdit || isDM}
          />
        </Stack>
      </Container>
    </PageTransition>
  );
}
