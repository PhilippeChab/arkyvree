import {
  EditCampaignDialog,
  type EditCampaignFormData,
} from "@/client/src/pages/campaigns/components/index.ts";
import {
  ConfirmDialog,
  DeleteDialog,
  DetailPageHeader,
  DiceSpinner,
  PageTransition,
  SectionTabs,
  type SectionTab,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { campaignDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Archive as ArchiveIcon,
  DeleteForever as DeleteForeverIcon,
  Edit as EditIcon,
  Group as PlayersIcon,
  Person as CharactersIcon,
  Unarchive as UnarchiveIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { CharactersSection, PlayersSection } from "./sections/index.ts";
import type { CampaignSection } from "./sectionQueries.ts";

type TabSection = CampaignSection;

const TABS: SectionTab<TabSection>[] = [
  { key: "characters", label: "Characters", icon: CharactersIcon },
  { key: "players", label: "Players", icon: PlayersIcon },
];

const SECTION_COMPONENTS = {
  characters: CharactersSection,
  players: PlayersSection,
} as const;

const isTabSection = (section: string | undefined): section is TabSection =>
  TABS.some((tab) => tab.key === section);

export default function CampaignDetailsPage() {
  const { id = "", section } = useParams<{ id: string; section?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const currentTab: TabSection = isTabSection(section) ? section : "characters";

  const { data: campaign, isLoading, error } = useQuery(campaignDetailQuery(id));

  usePageTitle(campaign?.name);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false);
  const editForm = useForm<EditCampaignFormData>();

  const invalidateCampaign = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
  };

  const updateMutation = useMutation({
    mutationFn: (data: EditCampaignFormData) => rpc.api.campaigns[":id"].$put({ param: { id }, json: data }),
    onSuccess: () => {
      snackbar.success("Campaign updated successfully");
      invalidateCampaign();
      setEditDialogOpen(false);
      editForm.reset();
    },
    onError: (error) => snackbar.error(error, "Failed to update campaign"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => rpc.api.campaigns[":id"].$delete({ param: { id } }),
    onSuccess: () => {
      snackbar.success("Campaign archived successfully");
      invalidateCampaign();
      navigate("/campaigns");
    },
    onError: (error) => snackbar.error(error, "Failed to archive campaign"),
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => rpc.api.campaigns[":id"].unarchive.$post({ param: { id } }),
    onSuccess: () => {
      snackbar.success("Campaign unarchived successfully");
      invalidateCampaign();
    },
    onError: (error) => snackbar.error(error, "Failed to unarchive campaign"),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: () => rpc.api.campaigns[":id"].permanent.$delete({ param: { id } }),
    onSuccess: () => {
      snackbar.success("Campaign permanently deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      navigate("/campaigns");
    },
    onError: (error) => snackbar.error(error, "Failed to delete campaign"),
  });

  // Normalize the URL to a known tab.
  useEffect(() => {
    if (id && !isTabSection(section)) {
      navigate(`/campaigns/${id}/characters`, { replace: true });
    }
  }, [id, section, navigate]);

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
          <DiceSpinner />
        </Box>
      </Container>
    );
  }

  if (error || !campaign) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: "center" }}>
          <Typography variant="h5" color="error" gutterBottom>
            Failed to load campaign
          </Typography>
          <Button variant="contained" onClick={() => navigate("/campaigns")} sx={{ mt: 2 }}>
            Back to Campaigns
          </Button>
        </Paper>
      </Container>
    );
  }

  const closeMenuAnd = (then: () => void) => () => {
    setAnchorEl(null);
    then();
  };

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <DetailPageHeader
          title={`⚔️ ${campaign.name}`}
          onBack={() => navigate("/campaigns")}
          onMenuOpen={(e) => setAnchorEl(e.currentTarget)}
          chips={(
            <>
              <Chip
                label={`${campaign.currentPlayers} ${campaign.currentPlayers === 1 ? "player" : "players"}`}
                color="primary"
                sx={{ fontWeight: 600 }}
              />
              <Chip label={campaign.rulesetName} color="secondary" sx={{ fontWeight: 600 }} />
            </>
          )}
          description={campaign.description || "Manage your campaign players, characters, and invitations"}
        />

        {campaign.deletedAt && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>This campaign is archived and read-only.</strong>{" "}
              You can view all content but cannot make changes.
            </Typography>
          </Alert>
        )}

        <SectionTabs
          tabs={TABS}
          value={currentTab}
          onChange={(key) => navigate(`/campaigns/${id}/${key}`)}
          aria-label="campaign details tabs"
        />

        {/* Both tabs stay mounted so switching keeps each one's search and loaded pages. */}
        {TABS.map(({ key }) => {
          const Section = SECTION_COMPONENTS[key];
          return (
            <Box key={key} role="tabpanel" hidden={key !== currentTab} sx={{ py: 3 }}>
              <Section campaign={campaign} />
            </Box>
          );
        })}

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          {campaign.deletedAt ? (
            [
              <MenuItem key="unarchive" onClick={closeMenuAnd(() => unarchiveMutation.mutate())} sx={{ color: "success.main" }}>
                <ListItemIcon sx={{ color: "inherit" }}><UnarchiveIcon fontSize="small" /></ListItemIcon>
                Unarchive
              </MenuItem>,
              <MenuItem key="hard-delete" onClick={closeMenuAnd(() => setHardDeleteDialogOpen(true))} sx={{ color: "error.main" }}>
                <ListItemIcon sx={{ color: "inherit" }}><DeleteForeverIcon fontSize="small" /></ListItemIcon>
                Delete permanently
              </MenuItem>,
            ]
          ) : (
            [
              <MenuItem
                key="edit"
                onClick={closeMenuAnd(() => {
                  editForm.reset({
                    name: campaign.name,
                    description: campaign.description ?? undefined,
                  });
                  setEditDialogOpen(true);
                })}
              >
                <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                Edit
              </MenuItem>,
              <MenuItem key="archive" onClick={closeMenuAnd(() => setArchiveDialogOpen(true))} sx={{ color: "warning.main" }}>
                <ListItemIcon sx={{ color: "inherit" }}><ArchiveIcon fontSize="small" /></ListItemIcon>
                Archive
              </MenuItem>,
            ]
          )}
        </Menu>

        <EditCampaignDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          form={editForm}
          onSubmit={(data) => updateMutation.mutate(data)}
          isLoading={updateMutation.isPending}
        />

        <ConfirmDialog
          open={archiveDialogOpen}
          onClose={() => setArchiveDialogOpen(false)}
          onConfirm={() => archiveMutation.mutate()}
          isLoading={archiveMutation.isPending}
          title="Archive Campaign"
          message="Are you sure you want to archive this campaign? You can restore it later from the archived campaigns section."
          confirmLabel="Archive Campaign"
          confirmColor="warning"
          confirmIcon={<ArchiveIcon />}
        />

        <DeleteDialog
          open={hardDeleteDialogOpen}
          onClose={() => setHardDeleteDialogOpen(false)}
          onConfirm={() => hardDeleteMutation.mutate()}
          title="Delete permanently"
          message="This will permanently delete this campaign, its players, invites, and all campaign-specific ruleset extensions. This cannot be undone."
          isLoading={hardDeleteMutation.isPending}
          confirmLabel="Delete permanently"
        />
      </Container>
    </PageTransition>
  );
}
