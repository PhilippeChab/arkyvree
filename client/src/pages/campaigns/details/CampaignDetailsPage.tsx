import {
  DeleteCampaignDialog,
  EditCampaignDialog,
  type EditCampaignFormData,
} from "@/client/src/pages/campaigns/components/index.ts";
import { DeleteDialog, DiceSpinner, PageTransition } from "@/client/src/components/common/index.ts";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Archive as ArchiveIcon,
  ArrowBack,
  DeleteForever as DeleteForeverIcon,
  Edit as EditIcon,
  Group as PlayersIcon,
  MoreVert as MoreVertIcon,
  Person as CharactersIcon,
  Unarchive as UnarchiveIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { CharactersSection, PlayersSection } from "./sections/index.ts";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`campaign-tabpanel-${index}`}
      aria-labelledby={`campaign-tab-${index}`}
      {...other}
    >
      <Box sx={{ py: 3 }}>{children}</Box>
    </div>
  );
}

type TabSection = "players" | "characters";

const TAB_CONFIG = [
  { key: "characters", label: "Characters", icon: CharactersIcon, component: CharactersSection },
  { key: "players", label: "Players", icon: PlayersIcon, component: PlayersSection },
] as const;

const TAB_SECTIONS: TabSection[] = TAB_CONFIG.map((tab) => tab.key);

export default function CampaignDetailsPage() {
  const { id, section } = useParams<{ id: string; section?: string }>();
  const navigate = useNavigate();

  // Get current tab value based on URL section
  const getTabValue = (): number => {
    if (!section) return 0; // Default to first tab (characters)
    const index = TAB_SECTIONS.indexOf(section as TabSection);
    return index >= 0 ? index : 0;
  };

  const {
    data: campaign,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.campaigns.detail(id!),
    queryFn: async () => {
      if (!id) throw new Error("No campaign ID provided");
      const response = await rpc.api.campaigns[":id"].$get({ param: { id } });
      if (!response.ok) throw new Error("Failed to fetch campaign");
      return response.json();
    },
  });

  usePageTitle(campaign?.name);

  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const currentTabValue = getTabValue();

  // Action menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false);
  const editForm = useForm<EditCampaignFormData>();

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditCampaignFormData }) => {
      const response = await rpc.api.campaigns[":id"].$put({
        param: { id },
        json: data,
      });
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Campaign updated successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      setEditDialogOpen(false);
      editForm.reset();
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await rpc.api.campaigns[":id"].$delete({
        param: { id: campaignId },
      });
      return response.json();
    },
    onSuccess: (_, campaignId) => {
      snackbar.success("Campaign archived successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaignId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      navigate("/campaigns");
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await rpc.api.campaigns[":id"]["unarchive"].$post({
        param: { id: campaignId },
      });
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Campaign unarchived successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      // rpc.ts throws ApiError on non-OK responses.
      const response = await rpc.api.campaigns[":id"]["permanent"].$delete({
        param: { id: campaignId },
      });
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Campaign permanently deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      navigate("/campaigns");
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const prefetchSection = useCallback((sectionKey: TabSection) => {
    if (!id) return;
    const sectionFetchers: Record<TabSection, () => Promise<Response>> = {
      characters: () => rpc.api.campaigns[":id"].characters.$get({ param: { id }, query: { page: "1", limit: "10" } }),
      players: () => rpc.api.campaigns[":id"].players.$get({ param: { id }, query: { page: "1", limit: "10" } }),
    };
    queryClient.prefetchInfiniteQuery({
      queryKey: [...queryKeys.campaigns.section(id, sectionKey), ""],
      queryFn: async () => {
        const response = await sectionFetchers[sectionKey]();
        if (!response.ok) throw new Error(`Failed to fetch ${sectionKey}`);
        return response.json();
      },
      initialPageParam: 1,
    });
  }, [id, queryClient]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    const newSection = TAB_SECTIONS[newValue];
    navigate(`/campaigns/${id}/${newSection}`);
  };

  const handleBack = () => {
    navigate("/campaigns");
  };

  // Redirect to characters tab if no section specified
  useEffect(() => {
    if (id && (!section || !TAB_SECTIONS.includes(section as TabSection))) {
      navigate(`/campaigns/${id}/characters`, { replace: true });
    }
  }, [id, section, navigate]);

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 400,
          }}
        >
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
          <Button
            variant="contained"
            onClick={() => navigate("/campaigns")}
            sx={{ mt: 2 }}
          >
            Back to Campaigns
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Header */}
        <Box
          sx={{
            mb: 4,
            display: "flex",
            alignItems: "center",
            py: 2,
            borderBottom: 1,
            borderColor: "divider",
            position: "relative",
          }}
        >
          <IconButton
            onClick={handleBack}
            size="large"
            sx={{
              position: "absolute",
              left: 0,
              "&:hover": {
                bgcolor: "action.hover",
              },
            }}
          >
            <ArrowBack />
          </IconButton>
          <IconButton
            size="large"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              position: "absolute",
              right: 0,
              "&:hover": {
                bgcolor: "action.hover",
              },
            }}
          >
            <MoreVertIcon />
          </IconButton>
          <Box
            sx={{
              flexGrow: 1,
              textAlign: "center",
              px: { xs: 5, md: 8 },
            }}
          >
            <Typography component="h3" sx={{ fontWeight: 700, mb: 1, typography: { xs: "h4", md: "h3" } }}>
              ⚔️ {campaign.name}
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
              <Chip
                label={`${campaign.currentPlayers} ${
                  campaign.currentPlayers === 1 ? "player" : "players"
                }`}
                size="medium"
                color="primary"
                variant="filled"
                sx={{ fontWeight: 600 }}
              />
              <Chip
                label={campaign.rulesetName}
                size="medium"
                color="secondary"
                variant="filled"
                sx={{ fontWeight: 600 }}
              />
            </Box>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                maxWidth: 600,
                mx: "auto"
              }}>
              {campaign.description || "Manage your campaign players, characters, and invitations"}
            </Typography>
          </Box>
        </Box>

        {/* Read-Only Banner for Archived Campaigns */}
        {campaign.deletedAt && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>This campaign is archived and read-only.</strong>{" "}
              You can view all content but cannot make changes.
            </Typography>
          </Alert>
        )}

        <Box sx={{ borderRadius: 2, bgcolor: "action.hover", p: 1, mb: 4 }}>
          <Tabs
            value={currentTabValue}
            onChange={handleTabChange}
            aria-label="campaign details tabs"
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              "& .MuiTabs-indicator": {
                height: 3,
                borderRadius: 1.5,
              },
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.875rem",
                minHeight: 48,
                borderRadius: 1,
                mx: 0.5,
                "&:hover": {
                  bgcolor: "action.hover",
                },
                "&.Mui-selected": {
                  bgcolor: "background.default",
                  boxShadow: 1,
                },
              },
              "& .MuiTabs-scrollButtons": {
                "&.Mui-disabled": {
                  opacity: 0.3,
                },
              },
            }}
          >
            {TAB_CONFIG.map((tab) => (
              <Tab
                key={tab.key}
                icon={<tab.icon />}
                label={tab.label}
                iconPosition="start"
                onMouseEnter={() => prefetchSection(tab.key)}
              />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ width: "100%" }}>
          {id &&
            TAB_CONFIG.map((tab, index) => (
              <TabPanel key={tab.key} value={currentTabValue} index={index}>
                <tab.component campaign={campaign} />
              </TabPanel>
            ))}
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          {campaign.deletedAt ? (
            [
              <MenuItem
                key="unarchive"
                onClick={() => {
                  setAnchorEl(null);
                  if (id) unarchiveMutation.mutate(id);
                }}
                sx={{ color: "success.main" }}
              >
                <UnarchiveIcon sx={{ mr: 1, fontSize: 20 }} /> Unarchive
              </MenuItem>,
              <MenuItem
                key="hard-delete"
                onClick={() => {
                  setAnchorEl(null);
                  setHardDeleteDialogOpen(true);
                }}
                sx={{ color: "error.main" }}
              >
                <DeleteForeverIcon sx={{ mr: 1, fontSize: 20 }} /> Delete permanently
              </MenuItem>,
            ]
          ) : (
            [
              <MenuItem
                key="edit"
                onClick={() => {
                  setAnchorEl(null);
                  editForm.reset({
                    name: campaign.name,
                    description: campaign.description ?? undefined,
                  });
                  setEditDialogOpen(true);
                }}
              >
                <EditIcon sx={{ mr: 1, fontSize: 20 }} /> Edit
              </MenuItem>,
              <MenuItem
                key="archive"
                onClick={() => {
                  setAnchorEl(null);
                  setArchiveDialogOpen(true);
                }}
                sx={{ color: "warning.main" }}
              >
                <ArchiveIcon sx={{ mr: 1, fontSize: 20 }} /> Archive
              </MenuItem>,
            ]
          )}
        </Menu>

        <EditCampaignDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          form={editForm}
          onSubmit={(data) => {
            if (id) updateMutation.mutate({ id, data });
          }}
          isLoading={updateMutation.isPending}
        />

        <DeleteCampaignDialog
          open={archiveDialogOpen}
          onClose={() => setArchiveDialogOpen(false)}
          onConfirm={() => {
            if (id) archiveMutation.mutate(id);
          }}
          isLoading={archiveMutation.isPending}
        />

        <DeleteDialog
          open={hardDeleteDialogOpen}
          onClose={() => setHardDeleteDialogOpen(false)}
          onConfirm={() => {
            if (id) hardDeleteMutation.mutate(id);
          }}
          title="Delete permanently"
          message="This will permanently delete this campaign, its players, invites, and all campaign-specific ruleset extensions. This cannot be undone."
          isLoading={hardDeleteMutation.isPending}
          confirmLabel="Delete permanently"
        />
      </Container>
    </PageTransition>
  );
}
