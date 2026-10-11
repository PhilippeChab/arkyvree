import { Container, Menu, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  ActionMenuItem,
  ArchivedNotice,
  ConfirmDialog,
  CountChip,
  DeleteDialog,
  DetailPageHeader,
  PageError,
  PageLoader,
  PageTransition,
  type SectionTab,
  SectionTabPanel,
  SectionTabs,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import {
  ArchiveIcon,
  CharacterIcon,
  DeleteIcon,
  EditIcon,
  PlayersIcon,
  UnarchiveIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { campaignDetailQuery } from "@/client/src/pages/campaigns/campaignQueries.ts";
import { EditCampaignDialog, type EditCampaignFormData } from "@/client/src/pages/campaigns/components/index.ts";
import { useCampaignPermissions } from "@/client/src/pages/campaigns/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { CampaignSection } from "./sectionQueries.ts";
import { CharactersSection, PlayersSection } from "./sections/index.ts";

const SECTION_COMPONENTS = {
  characters: CharactersSection,
  players: PlayersSection,
} as const;

const TABS: SectionTab<CampaignSection>[] = [
  { key: "characters", label: "Characters", icon: CharacterIcon },
  { key: "players", label: "Players", icon: PlayersIcon },
];

function isTabSection(section: string | undefined): section is CampaignSection {
  return TABS.some((tab) => tab.key === section);
}

export default function CampaignDetailsPage() {
  const { id = "", section } = useParams<{ id: string; section?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const currentTab: CampaignSection = isTabSection(section) ? section : "characters";

  const { data: campaign, isLoading, error } = useQuery(campaignDetailQuery(id));
  // Editing, archiving and deleting are the Game Master's.
  const { canEdit } = useCampaignPermissions(campaign);

  usePageTitle(campaign?.name);

  const menu = useAnchorMenu();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false);
  const editForm = useFormWith<EditCampaignFormData>({ name: "", description: "" });

  // The campaign itself and its lists: its tabs didn't change
  const invalidateCampaign = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.detail(id), exact: true });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.lists });
  };

  const updateMutation = useMutation({
    mutationFn: (data: EditCampaignFormData) =>
      parseResponse(rpc.api.campaigns[":id"].$put({ param: { id }, json: data })),
    onSuccess: () => {
      snackbar.success("Campaign updated");
      invalidateCampaign();
      setEditDialogOpen(false);
    },
    onError: (error) => snackbar.error(error, "Failed to update campaign"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.campaigns[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      snackbar.success("Campaign archived");
      invalidateCampaign();
      navigate("/campaigns");
    },
    onError: (error) => snackbar.error(error, "Failed to archive campaign"),
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.campaigns[":id"].unarchive.$post({ param: { id } })),
    onSuccess: () => {
      snackbar.success("Campaign unarchived");
      invalidateCampaign();
    },
    onError: (error) => snackbar.error(error, "Failed to unarchive campaign"),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.campaigns[":id"].permanent.$delete({ param: { id } })),
    onSuccess: () => {
      snackbar.success("Campaign permanently deleted");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.lists });
      navigate("/campaigns");
      // Gone, with its tabs: don't let Back render them from the cache
      queryClient.removeQueries({ queryKey: QUERY_KEYS.campaigns.detail(id) });
    },
    onError: (error) => snackbar.error(error, "Failed to delete campaign"),
  });

  // Normalize the URL to a known tab.
  if (id && !isTabSection(section)) return <Navigate to={`/campaigns/${id}/characters`} replace />;

  if (isLoading) {
    return (
      <Container>
        <PageLoader />
      </Container>
    );
  }

  // A passing refetch failure keeps the loaded page; a deleted campaign or a removed member leaves it.
  if (!campaign || accessLost(error)) {
    return (
      <Container>
        <PageError
          message={loadFailureMessage("Campaign", error)}
          backLabel="Back to Campaigns"
          backTo={"/campaigns"}
        />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container>
        <Stack spacing={4}>
          <DetailPageHeader
            title={campaign.name}
            backTo={"/campaigns"}
            onMenuOpen={canEdit ? menu.openMenu : undefined}
            chips={
              <>
                <CountChip label={formatCount(campaign.currentPlayers, "player")} />
                <ValueChip label={campaign.rulesetName} />
              </>
            }
            description={campaign.description}
          />

          {/* An archived campaign's notice, above its tabs */}
          <Stack spacing={3}>
            {!!campaign.deletedAt && <ArchivedNotice what="campaign" canUnarchive={canEdit} />}

            <SectionTabs
              tabs={TABS}
              value={currentTab}
              // Each tab's search has its own URL param, so switching keeps both.
              onChange={(key) => navigate({ pathname: `/campaigns/${id}/${key}`, search: location.search })}
              aria-label="Campaign Details Tabs"
            />
          </Stack>

          {/* Both tabs stay mounted so switching keeps each one's search and loaded pages. */}
          {TABS.map(({ key }) => {
            const Section = SECTION_COMPONENTS[key];
            return (
              <SectionTabPanel key={key} hidden={key !== currentTab}>
                <Section campaign={campaign} />
              </SectionTabPanel>
            );
          })}
        </Stack>

        <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
          {campaign.deletedAt
            ? [
                <ActionMenuItem
                  key="unarchive"
                  icon={UnarchiveIcon}
                  label="Unarchive"
                  intent="positive"
                  onClick={menu.closeMenuAnd(() => unarchiveMutation.mutate())}
                />,
                <ActionMenuItem
                  key="hard-delete"
                  icon={DeleteIcon}
                  label="Delete Permanently"
                  intent="destructive"
                  onClick={menu.closeMenuAnd(() => setHardDeleteDialogOpen(true))}
                />,
              ]
            : [
                <ActionMenuItem
                  key="edit"
                  icon={EditIcon}
                  label="Edit"
                  onClick={menu.closeMenuAnd(() => {
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
                  onClick={menu.closeMenuAnd(() => setArchiveDialogOpen(true))}
                />,
              ]}
        </Menu>

        <EditCampaignDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          form={editForm}
          onSubmit={(data) => updateMutation.mutate(data)}
          pending={updateMutation.isPending}
        />

        <ConfirmDialog
          open={archiveDialogOpen}
          onClose={() => setArchiveDialogOpen(false)}
          onConfirm={() => archiveMutation.mutate()}
          pending={archiveMutation.isPending}
          title="Archive Campaign"
          message="Are you sure you want to archive this campaign? You can unarchive it at any time from the Archived filter."
          confirmLabel="Archive Campaign"
          intent="caution"
          confirmIcon={<ArchiveIcon />}
        />

        <DeleteDialog
          open={hardDeleteDialogOpen}
          onClose={() => setHardDeleteDialogOpen(false)}
          onConfirm={() => hardDeleteMutation.mutate()}
          title="Delete Permanently"
          message="Are you sure you want to permanently delete this campaign? Its players, invites and campaign-specific ruleset extensions go with it. This action cannot be undone."
          pending={hardDeleteMutation.isPending}
          confirmLabel="Delete Permanently"
        />
      </Container>
    </PageTransition>
  );
}
