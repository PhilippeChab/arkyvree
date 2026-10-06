import { Container, IconButton, Menu, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { CharacterDetailSkeleton, CharacterSheetBody } from "@/client/src/components/characters/index.ts";
import { ActionMenuItem, PageError } from "@/client/src/components/common/index.ts";
import { BackIcon, DownloadIcon, EditIcon, MoreIcon } from "@/client/src/components/icons/index.ts";
import { usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
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
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
        >
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", minWidth: 0 }}>
            <IconButton aria-label="Back" component={Link} to={`/campaigns/${campaignId}`}>
              <BackIcon />
            </IconButton>
            <Typography component="p" sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
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
                <MoreIcon />
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
