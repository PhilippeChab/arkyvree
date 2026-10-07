import { Alert, Container, Menu, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import {
  CharacterDetailSkeleton,
  CharacterHeader,
  CharacterSheetBody,
} from "@/client/src/components/characters/index.ts";
import { ActionMenuItem, PageError } from "@/client/src/components/common/index.ts";
import { DownloadIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu, usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { campaignCharacterQuery } from "./campaignQueries.ts";

export default function CampaignCharacterPage() {
  const { id: campaignId = "", characterId = "" } = useParams<{ characterId: string; id: string }>();
  const navigate = useNavigate();
  const menu = useAnchorMenu();

  const { data, isLoading, error } = useQuery(campaignCharacterQuery(campaignId, characterId));

  const pdfExport = usePdfExport(() =>
    rpc.api.campaigns[":id"].characters[":characterId"]["pdf"]["$post"]({
      param: { id: campaignId, characterId },
    }),
  );

  usePageTitle(data?.identity?.physiology?.name);

  if (!campaignId || !characterId) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">Invalid campaign or character ID.</Alert>
      </Container>
    );
  }

  if (isLoading) return <CharacterDetailSkeleton />;

  // A passing refetch failure keeps the loaded sheet; a revoked visibility or unlink hides it.
  if (!data || accessLost(error)) {
    return (
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <PageError
          message={loadFailureMessage("Character", error)}
          backLabel="Back to Campaign"
          backTo={`/campaigns/${campaignId}/characters`}
        />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
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
              onClick={menu.closeMenuAnd(() => navigate(`/characters/${characterId}`))}
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
        />
      </Stack>
    </Container>
  );
}
