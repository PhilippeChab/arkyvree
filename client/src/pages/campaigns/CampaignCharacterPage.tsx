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
import { rpc } from "@/client/src/services/rpc.ts";

import { campaignCharacterQuery } from "./campaignQueries.ts";

export default function CampaignCharacterPage() {
  const { id: campaignId = "", characterId = "" } = useParams<{ characterId: string; id: string }>();
  const menu = useAnchorMenu();
  // The tab the sheet was opened from: its header's Back and its error page's go there alike
  const backTo = `/campaigns/${campaignId}/characters`;

  const { data, isLoading, error } = useQuery(campaignCharacterQuery(campaignId, characterId));

  const exportFn = () =>
    parseResponse(
      rpc.api.campaigns[":id"].characters[":characterId"].pdf.$post({ param: { id: campaignId, characterId } }),
    );
  const pdfExport = usePdfExport(exportFn);

  usePageTitle(data?.identity?.physiology?.name);

  if (isLoading) return <CharacterDetailSkeleton />;

  // A passing refetch failure keeps the loaded sheet; a revoked visibility or unlink hides it. An address without its
  // ids loads nothing, and says so here too.
  if (!data || accessLost(error)) {
    return (
      <Container maxWidth="xl">
        <PageError message={loadFailureMessage("Character", error)} backLabel="Back to Campaign" backTo={backTo} />
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
            backTo={backTo}
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
            showPrivateNotes={data.showPrivateNotes}
          />
        </Stack>
      </Container>
    </PageTransition>
  );
}
