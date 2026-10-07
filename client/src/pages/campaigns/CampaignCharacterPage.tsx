import { Alert, Container, IconButton, Menu, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { CharacterDetailSkeleton, CharacterSheetBody } from "@/client/src/components/characters/index.ts";
import { ActionMenuItem, PageError } from "@/client/src/components/common/index.ts";
import { ArrowBackIcon, DownloadIcon, EditIcon, MoreVertIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu, usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { campaignCharacterQuery } from "./campaignQueries.ts";

export default function CampaignCharacterPage() {
  const { id: campaignId = "", characterId = "" } = useParams<{ id: string; characterId: string }>();
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
          onBack={() => navigate(`/campaigns/${campaignId}/characters`)}
        />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", minWidth: 0 }}>
              <IconButton aria-label="Back" component={Link} to={`/campaigns/${campaignId}`}>
                <ArrowBackIcon />
              </IconButton>
              <Typography component="h1" sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
                {data.rulesetName || "Character Sheet"}
              </Typography>
            </Stack>

            {data.canDownloadPdf && !data.deletedAt && (
              <Stack direction="row" spacing={1}>
                <IconButton aria-label="More Actions" onClick={menu.openMenu} sx={{ color: "text.secondary" }}>
                  <MoreVertIcon />
                </IconButton>
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
              </Stack>
            )}
          </Stack>
        </Paper>
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
