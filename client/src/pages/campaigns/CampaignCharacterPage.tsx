import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError, rpc } from "@/client/src/services/rpc.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import {
  CharacterDetailSkeleton,
  CharacterSheetBody,
} from "@/client/src/components/characters/index.ts";
import {
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import { DURATION } from "@/client/src/lib/animations.ts";
import {
  Alert,
  Container,
  Fade,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
export default function CampaignCharacterPage() {
  const { id: campaignId, characterId } = useParams<{ id: string; characterId: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.campaigns.characterDetail(campaignId!, characterId!),
    queryFn: async () => {
      const response = await rpc.api.campaigns[":id"].characters[":characterId"]["$get"]({
        param: { id: campaignId!, characterId: characterId! },
      });
      if (!response.ok) throw new Error("Failed to fetch character");
      return response.json();
    },
    enabled: !!campaignId && !!characterId,
  });

  usePageTitle(data?.identity?.physiology?.name);

  const handleClose = () => setAnchorEl(null);

  const handleDownloadPdf = async () => {
    if (!characterId) return;
    try {
      await rpc.api.characters[":characterId"]["pdf"]["$post"]({
        param: { characterId },
      });
      snackbar.info("Your PDF is being generated. You'll be notified when it's ready.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        snackbar.warning("Too many PDF requests. Please wait a minute before trying again.");
      } else {
        snackbar.error(error, "Failed to start PDF generation");
      }
    }
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
        <div><CharacterDetailSkeleton /></div>
      </Fade>
    );
  }

  if (error || !data || "error" in data || !("identity" in data)) {
    return (
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Alert severity="error">Failed to load character details.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1
          }}>
          <Stack
            direction="row"
            spacing={2}
            sx={{
              alignItems: "center",
              minWidth: 0
            }}>
            <IconButton onClick={() => navigate(`/campaigns/${campaignId}`)}>
              <ArrowBackIcon />
            </IconButton>
            <Typography sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
              {data.rulesetName || "Character Sheet"}
            </Typography>
          </Stack>

          {data.canEdit && !data.deletedAt && (
            <Stack direction="row" spacing={1}>
              <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ color: "text.secondary" }}>
                <MoreVertIcon />
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                <MenuItem
                  onClick={() => {
                    navigate(`/characters/${characterId}`);
                    handleClose();
                  }}
                >
                  <ListItemIcon>
                    <EditIcon fontSize="small" />
                  </ListItemIcon>
                  Edit Character
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    handleDownloadPdf();
                    handleClose();
                  }}
                >
                  <ListItemIcon>
                    <DownloadIcon fontSize="small" />
                  </ListItemIcon>
                  Download PDF
                </MenuItem>
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
