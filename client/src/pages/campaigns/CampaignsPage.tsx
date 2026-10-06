import { Button, Container } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  BlankState,
  CREATED_SORTS,
  DiceSpinner,
  type FilterOption,
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
import { ArchiveIcon, CampaignsIcon } from "@/client/src/components/icons/index.ts";
import { useListParams, usePageTitle, useStaggerOffset } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { campaignDetailQuery, type CampaignListFilters, campaignListQuery } from "@/client/src/lib/queries.ts";
import { campaignTags, CreateCampaignDialog } from "@/client/src/pages/campaigns/components/index.ts";
import { prefetchCampaignSections } from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { useCampaignOperations } from "@/client/src/pages/campaigns/hooks/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

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

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...listQuery,
    placeholderData: keepPreviousData,
  });

  const campaigns = pageItems(data);
  const offset = useStaggerOffset(campaigns);

  // Warm the detail page and its tabs while the pointer is on a card.
  const prefetchCampaign = (id: string) => {
    void queryClient.prefetchQuery(campaignDetailQuery(id));
    void prefetchCampaignSections(queryClient, id);
  };

  const createButton = (label: string) => <PageActionButton onClick={handleCreate}>{label}</PageActionButton>;

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
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
          <>
            <ListCardGrid>
              {campaigns.map((campaign, index) => {
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
                    tags={campaignTags(campaign)}
                  />
                );
              })}
            </ListCardGrid>
            <LoadMoreButton
              size="large"
              label="Load More Campaigns"
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            />
          </>
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
            icon={CampaignsIcon}
            title="No campaigns yet"
            description={
              isDemo
                ? "Sign up to create campaigns and run multiplayer sessions."
                : "Create your first campaign to start organizing your adventures"
            }
            action={!isDemo && createButton("Create Your First Campaign")}
          />
        )}

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
