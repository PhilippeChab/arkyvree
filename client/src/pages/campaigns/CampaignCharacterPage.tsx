import { Alert, Container, Fade, IconButton, Menu, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { CharacterDetailSkeleton, CharacterSheetBody } from "@/client/src/components/characters/index.ts";
import { ActionMenuItem, PageError } from "@/client/src/components/common/index.ts";
import { ArrowBackIcon, DownloadIcon, EditIcon, MoreVertIcon } from "@/client/src/components/icons/index.ts";
import { usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { DURATION } from "@/client/src/lib/animations.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { campaignCharacterQuery } from "./campaignQueries.ts";

export default function CampaignCharacterPage() {
  const { id: campaignId = "", characterId = "" } = useParams<{ id: string; characterId: string }>();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { data, isLoading, error } = useQuery(campaignCharacterQuery(campaignId, characterId));

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

  if (!campaignId || !characterId) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">Invalid campaign or character ID.</Alert>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Fade in timeout={DURATION.slow}>
        <div>
          <CharacterDetailSkeleton />
        </div>
      </Fade>
    );
  }

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
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", minWidth: 0 }}>
            <IconButton aria-label="Back" component={Link} to={`/campaigns/${campaignId}`}>
              <ArrowBackIcon />
            </IconButton>
            <Typography sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
              {data.rulesetName || "Character Sheet"}
            </Typography>
          </Stack>

          {data.canDownloadPdf && !data.deletedAt && (
            <Stack direction="row" spacing={1}>
              <IconButton
                aria-label="More actions"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{ color: "text.secondary" }}
              >
                <MoreVertIcon />
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                {data.canEdit && (
                  <ActionMenuItem
                    icon={EditIcon}
                    label="Edit Character"
                    onClick={closeMenuAnd(() => navigate(`/characters/${characterId}`))}
                  />
                )}
                <ActionMenuItem
                  icon={DownloadIcon}
                  label="Download PDF"
                  onClick={closeMenuAnd(() => pdfExport.mutate())}
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
    </Container>
  );
}
