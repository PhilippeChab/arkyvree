import { Button, Container, Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  BlankState,
  CREATED_SORTS,
  DiceSpinner,
  type FilterOption,
  InfoPill,
  ListCard,
  ListCardGrid,
  LoadError,
  LoadMoreButton,
  NAME_SORTS,
  NoMatchesState,
  PageActionButton,
  PageHeader,
  PageTransition,
  SearchBar,
  type SortOption,
  UPDATED_SORTS,
} from "@/client/src/components/common/index.ts";
import { ArchiveIcon, AutoStoriesIcon, CampaignIcon, GroupIcon } from "@/client/src/components/icons/index.ts";
import { useListParams, usePageTitle, useStaggerAnimation } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { campaignDetailQuery, type CampaignListFilters, campaignListQuery } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { CreateCampaignDialog } from "./components/index.ts";
import { prefetchCampaignSections } from "./details/sectionQueries.ts";
import { useCampaignOperations } from "./hooks/index.ts";

type SortField = CampaignListFilters["orderBy"];

const CAMPAIGN_FILTER_OPTIONS: FilterOption<"active" | "archived">[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const CAMPAIGN_SORT_OPTIONS: SortOption<SortField>[] = [...NAME_SORTS, ...CREATED_SORTS, ...UPDATED_SORTS];

export default function CampaignsPage() {
  usePageTitle("Campaigns");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ["name", "createdAt", "updatedAt"],
    { orderBy: "createdAt", orderDir: "desc" },
  );
  const isDemo = useAuthStore((s) => !!s.user?.expiresAt);

  const view = oneOf(searchParams.get("view"), ["active", "archived"], "active");

  const { createDialogOpen, setCreateDialogOpen, createForm, createMutation, handleCreate, confirmCreate } =
    useCampaignOperations();

  const listQuery = campaignListQuery({ view, search, orderBy, orderDir });
  const { offset, updateOffset } = useStaggerAnimation(listQuery.queryKey);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...listQuery,
    placeholderData: keepPreviousData,
  });

  const campaigns = pageItems(data);

  // Warm the detail page and its tabs while the pointer is on a card.
  const prefetchCampaign = (id: string) => {
    void queryClient.prefetchQuery(campaignDetailQuery(id));
    void prefetchCampaignSections(queryClient, id);
  };

  const createButton = (label: string) => <PageActionButton label={label} onClick={handleCreate} />;

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <PageHeader
            variant="tinted"
            title="Campaigns"
            subtitle="Manage your campaigns and organize your adventuring parties"
            action={!isDemo && createButton("Create New Campaign")}
          />

          <SearchBar
            {...searchBarProps}
            searchPlaceholder="Search campaigns..."
            filterOptions={CAMPAIGN_FILTER_OPTIONS}
            filterValue={view}
            onFilterChange={(value) => updateSearchParams({ view: value })}
            sortOptions={CAMPAIGN_SORT_OPTIONS}
          />

          {isLoading ? (
            <DiceSpinner sx={{ py: { xs: 4, sm: 8 } }} />
          ) : error ? (
            <LoadError what="Campaigns" error={error} />
          ) : campaigns.length > 0 ? (
            <Stack spacing={3} sx={{ pb: hasNextPage ? 0 : 3 }}>
              <ListCardGrid>
                {campaigns.map((campaign, index) => {
                  const players = formatCount(campaign.currentPlayers, "player");
                  return (
                    <ListCard
                      key={campaign.id}
                      isArchived={view === "archived"}
                      animationIndex={index}
                      animationOffset={offset}
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                      onMouseEnter={() => prefetchCampaign(campaign.id)}
                      onFocus={() => prefetchCampaign(campaign.id)}
                      avatarTone="secondary"
                      title={campaign.name}
                      description={campaign.description}
                      pills={
                        <>
                          <InfoPill
                            icon={GroupIcon}
                            label={players}
                            color="info"
                            tooltip={`${players} in this campaign`}
                          />
                          <InfoPill
                            icon={AutoStoriesIcon}
                            label={campaign.rulesetName}
                            color="secondary"
                            tooltip={campaign.rulesetName}
                          />
                        </>
                      }
                    />
                  );
                })}
              </ListCardGrid>
              <LoadMoreButton
                size="large"
                label="Load More Campaigns"
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onClick={() => {
                  updateOffset(campaigns.length);
                  fetchNextPage();
                }}
              />
            </Stack>
          ) : search ? (
            <NoMatchesState search={search} />
          ) : view === "archived" ? (
            <BlankState
              icon={ArchiveIcon}
              title="No archived campaigns"
              description="Campaigns you archive will appear here. You can restore them at any time."
              action={
                <Button variant="outlined" onClick={() => updateSearchParams({ view: null })}>
                  View Active Campaigns
                </Button>
              }
            />
          ) : (
            <BlankState
              icon={CampaignIcon}
              title="No campaigns yet"
              description={
                isDemo
                  ? "Sign up to create campaigns and run multiplayer sessions."
                  : "Create your first campaign to start organizing your adventures"
              }
              action={!isDemo && createButton("Create Your First Campaign")}
            />
          )}
        </Stack>

        <CreateCampaignDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          form={createForm}
          onSubmit={confirmCreate}
          isLoading={createMutation.isPending}
        />
      </Container>
    </PageTransition>
  );
}
