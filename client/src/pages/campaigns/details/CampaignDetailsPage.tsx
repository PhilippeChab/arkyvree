import { Alert, Box, Menu, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  ActionMenuItem,
  ConfirmDialog,
  DeleteDialog,
  DetailPageHeader,
  DiceSpinner,
  PageBody,
  PageError,
  type SectionTab,
  SectionTabs,
} from "@/client/src/components/common/index.ts";
import {
  ArchiveIcon,
  CharactersIcon,
  DeleteForeverIcon,
  EditIcon,
  PlayersIcon,
  UnarchiveIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { campaignDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  campaignTags,
  EditCampaignDialog,
  type EditCampaignFormData,
} from "@/client/src/pages/campaigns/components/index.ts";
import { useCampaignPermissions } from "@/client/src/pages/campaigns/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { CampaignSection } from "./sectionQueries.ts";
import { CharactersSection, PlayersSection } from "./sections/index.ts";

type TabSection = CampaignSection;

const SECTION_COMPONENTS = {
  characters: CharactersSection,
  players: PlayersSection,
} as const;

const TABS: SectionTab<TabSection>[] = [
  { key: "characters", label: "Characters", icon: CharactersIcon },
  { key: "players", label: "Players", icon: PlayersIcon },
];

function isTabSection(section: string | undefined): section is TabSection {
  return TABS.some((tab) => tab.key === section);
}

export default function CampaignDetailsPage() {
  const { id = "", section } = useParams<{ id: string; section?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const currentTab: TabSection = isTabSection(section) ? section : "characters";

  const { data: campaign, isLoading, error } = useQuery(campaignDetailQuery(id));
  // Editing, archiving and deleting are the Game Master's.
  const { canEdit } = useCampaignPermissions(campaign);

  usePageTitle(campaign?.name);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false);
  const editForm = useFormWith<EditCampaignFormData>({ name: "", description: "" });

  const invalidateCampaign = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
  };

  const updateMutation = useMutation({
    mutationFn: (data: EditCampaignFormData) => rpc.api.campaigns[":id"].$put({ param: { id }, json: data }),
    onSuccess: () => {
      snackbar.success("Campaign updated");
      invalidateCampaign();
      setEditDialogOpen(false);
      editForm.reset();
    },
    onError: (error) => snackbar.error(error, "Failed to update campaign"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => rpc.api.campaigns[":id"].$delete({ param: { id } }),
    onSuccess: () => {
      snackbar.success("Campaign archived");
      invalidateCampaign();
      navigate("/campaigns");
    },
    onError: (error) => snackbar.error(error, "Failed to archive campaign"),
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => rpc.api.campaigns[":id"].unarchive.$post({ param: { id } }),
    onSuccess: () => {
      snackbar.success("Campaign unarchived");
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
  if (id && !isTabSection(section)) {
    return <Navigate to={`/campaigns/${id}/characters`} replace />;
  }

  if (isLoading) {
    return (
      <PageBody>
        <DiceSpinner sx={{ minHeight: 400 }} />
      </PageBody>
    );
  }

  // A passing refetch failure keeps the loaded page; a deleted campaign or a removed member leaves it.
  if (!campaign || accessLost(error)) {
    return (
      <PageBody>
        <PageError
          message={loadFailureMessage("Campaign", error)}
          backLabel="Back to Campaigns"
          backTo={"/campaigns"}
        />
      </PageBody>
    );
  }

  const closeMenuAnd = (then: () => void) => () => {
    setAnchorEl(null);
    then();
  };

  return (
    <PageBody>
      <DetailPageHeader
        title={`⚔️ ${campaign.name}`}
        backTo={"/campaigns"}
        onMenuOpen={canEdit ? (e) => setAnchorEl(e.currentTarget) : undefined}
        tags={campaignTags(campaign)}
        description={campaign.description || "Manage your campaign players, characters, and invitations"}
      />

      {campaign.deletedAt && (
        <Alert severity="info">
          <Typography variant="body2">
            <strong>This campaign is archived and read-only.</strong> You can view all content but cannot make changes.
          </Typography>
        </Alert>
      )}

      <SectionTabs
        tabs={TABS}
        value={currentTab}
        // Each tab's search has its own URL param, so switching keeps both.
        onChange={(key) => navigate({ pathname: `/campaigns/${id}/${key}`, search: location.search })}
        aria-label="campaign details tabs"
      />

      {/* Both tabs stay mounted so switching keeps each one's search and loaded pages. */}
      {TABS.map(({ key }) => {
        const Section = SECTION_COMPONENTS[key];
        return (
          <Box key={key} role="tabpanel" hidden={key !== currentTab}>
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
        {campaign.deletedAt
          ? [
              <ActionMenuItem
                key="unarchive"
                icon={UnarchiveIcon}
                label="Unarchive"
                intent="positive"
                onClick={closeMenuAnd(() => unarchiveMutation.mutate())}
              />,
              <ActionMenuItem
                key="hard-delete"
                icon={DeleteForeverIcon}
                label="Delete Permanently"
                intent="destructive"
                onClick={closeMenuAnd(() => setHardDeleteDialogOpen(true))}
              />,
            ]
          : [
              <ActionMenuItem
                key="edit"
                icon={EditIcon}
                label="Edit"
                onClick={closeMenuAnd(() => {
                  editForm.reset({
                    name: campaign.name,
                    description: campaign.description ?? "",
                  });
                  setEditDialogOpen(true);
                })}
              />,
              <ActionMenuItem
                key="archive"
                icon={ArchiveIcon}
                label="Archive"
                intent="caution"
                onClick={closeMenuAnd(() => setArchiveDialogOpen(true))}
              />,
            ]}
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
        title="Delete Permanently"
        message="Are you sure you want to delete this campaign permanently? Its players, invites and campaign-specific ruleset extensions go with it. This action cannot be undone."
        isLoading={hardDeleteMutation.isPending}
        confirmLabel="Delete Permanently"
      />
    </PageBody>
  );
}
