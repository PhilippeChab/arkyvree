import {
  BlankState,
  InfoPill,
  ListCard,
  ListCardGrid,
  LoadMoreButton,
  PageActionButton,
  PageHeader,
  PageTransition,
  SearchBar,
  type FilterOption,
  type SortOption,
  DiceSpinner,
} from "@/client/src/components/common/index.ts";
import { CreateCampaignDialog } from "@/client/src/pages/campaigns/components/index.ts";
import { useDebouncedValue, usePageTitle, useStaggerAnimation, useUpdateSearchParams } from "@/client/src/hooks/index.ts";
import { useCampaignOperations } from "@/client/src/pages/campaigns/hooks/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { campaignDetailQuery, campaignListQuery, type CampaignListFilters } from "@/client/src/lib/queries.ts";
import {
  Archive as ArchiveIcon,
  AutoStories as RulesetIcon,
  Group as GroupIcon,
  Map as CampaignIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Container,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { prefetchCampaignSections } from "@/client/src/pages/campaigns/details/sectionQueries.ts";

type SortField = CampaignListFilters["orderBy"];

const CAMPAIGN_FILTER_OPTIONS: FilterOption<"active" | "archived">[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const CAMPAIGN_SORT_OPTIONS: SortOption<SortField>[] = [
  { field: "name", direction: "asc", label: "Name (A-Z)" },
  { field: "name", direction: "desc", label: "Name (Z-A)" },
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
  { field: "updatedAt", direction: "desc", label: "Recently Updated" },
  { field: "updatedAt", direction: "asc", label: "Least Recently Updated" },
];

export default function CampaignsPage() {
  usePageTitle("Campaigns");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const isDemo = useAuthStore((s) => !!s.user?.expiresAt);

  const view = oneOf(searchParams.get("view"), ["active", "archived"], "active");
  const searchQuery = searchParams.get("search") || "";
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const orderBy = oneOf(searchParams.get("orderBy"), ["name", "createdAt", "updatedAt"], "createdAt");
  const orderDir = oneOf(searchParams.get("orderDir"), ["asc", "desc"], "desc");

  const {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
    confirmCreate,
  } = useCampaignOperations();

  const listQuery = campaignListQuery({ view, search: debouncedSearchQuery, orderBy, orderDir });
  const { offset, updateOffset } = useStaggerAnimation(listQuery.queryKey);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...listQuery, placeholderData: keepPreviousData });

  const campaigns = data?.pages.flatMap((page) => page.items) ?? [];

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
          searchValue={searchQuery}
          onSearchChange={(value) => updateSearchParams({ search: value }, { replace: true })}
          searchPlaceholder="Search campaigns..."
          filterOptions={CAMPAIGN_FILTER_OPTIONS}
          filterValue={view}
          onFilterChange={(value) => updateSearchParams({ view: value })}
          sortOptions={CAMPAIGN_SORT_OPTIONS}
          sortField={orderBy}
          sortDirection={orderDir}
          onSortChange={(field, direction) => updateSearchParams({ orderBy: field, orderDir: direction })}
        />

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: { xs: 4, sm: 8 } }}>
            <DiceSpinner />
          </Box>
        ) : error ? (
          <Alert severity="error">Failed to load campaigns.</Alert>
        ) : campaigns.length > 0 ? (
          <>
            <ListCardGrid>
              {campaigns.map((campaign, index) => {
                const players = `${campaign.currentPlayers} ${campaign.currentPlayers === 1 ? "player" : "players"}`;
                return (
                  <ListCard
                    key={campaign.id}
                    isArchived={view === "archived"}
                    animationIndex={index}
                    animationOffset={offset}
                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    onMouseEnter={() => prefetchCampaign(campaign.id)}
                    onFocus={() => prefetchCampaign(campaign.id)}
                    avatar={campaign.name.charAt(0).toUpperCase()}
                    avatarTone="secondary"
                    title={campaign.name}
                    description={campaign.description}
                    pills={(
                      <>
                        <InfoPill icon={GroupIcon} label={players} color="info" tooltip={`${players} in this campaign`} />
                        <InfoPill icon={RulesetIcon} label={campaign.rulesetName} color="secondary" tooltip={campaign.rulesetName} />
                      </>
                    )}
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
          </>
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
            description={isDemo
              ? "Sign up to create campaigns and run multiplayer sessions."
              : "Create your first campaign to start organizing your adventures"}
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
