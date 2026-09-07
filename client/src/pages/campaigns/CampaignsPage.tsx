import {
  BlankState,
  PageTransition,
  SearchBar,
  type FilterOption,
  type SortOption,
  StyledCard,
  DiceSpinner,
} from "@/client/src/components/common/index.ts";
import { CreateCampaignDialog } from "@/client/src/pages/campaigns/components/index.ts";
import { useDebouncedValue, usePageTitle, useStaggerAnimation } from "@/client/src/hooks/index.ts";
import { useCampaignOperations } from "@/client/src/pages/campaigns/hooks/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  AutoStories as RulesetIcon,
  Group as GroupIcon,
  Map as CampaignIcon,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type CampaignResponse = InferResponseType<typeof rpc.api.campaigns.$get>;
type CampaignPaginated = Exclude<CampaignResponse, { error: string }>;
type Campaign = CampaignPaginated["items"][number];

type SortField = "name" | "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";

function CampaignCard({
  campaign,
  isArchived,
  animationIndex,
  animationOffset,
}: {
  campaign: Campaign;
  isArchived: boolean;
  animationIndex: number;
  animationOffset: number;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.campaigns.detail(campaign.id),
      queryFn: async () => {
        const response = await rpc.api.campaigns[":id"].$get({
          param: { id: campaign.id },
        });
        if (!response.ok) throw new Error("Failed to fetch campaign");
        return response.json();
      },
    });
    queryClient.prefetchInfiniteQuery({
      queryKey: [...queryKeys.campaigns.section(campaign.id, "characters"), ""],
      queryFn: async () => {
        const response = await rpc.api.campaigns[":id"].characters.$get({
          param: { id: campaign.id },
          query: { page: "1", limit: "10" },
        });
        if (!response.ok) throw new Error("Failed to fetch characters");
        return response.json();
      },
      initialPageParam: 1,
    });
  }, [queryClient, campaign.id]);

  return (
    <StyledCard
      isArchived={isArchived}
      animationIndex={animationIndex}
      animationOffset={animationOffset}
      onClick={() => navigate(`/campaigns/${campaign.id}`)}
      onMouseEnter={prefetch}
      onFocus={prefetch}
    >
      <Box sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 1.5, sm: 2 } }}>
        {/* Title Row with Avatar */}
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: "center",
            mb: 1,
            minWidth: 0
          }}>
          <Avatar
            sx={{
              width: 36,
              height: 36,
              border: "2px solid",
              borderColor: "secondary.main",
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.secondary.light}, ${theme.palette.secondary.main})`,
              fontSize: "1rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {campaign.name.charAt(0).toUpperCase()}
          </Avatar>
          <Typography
            variant="h6"
            noWrap
            sx={{
              fontWeight: 600,
              color: "text.primary",
              lineHeight: 1.2,
              textAlign: "left",
              flex: 1,
            }}
          >
            {campaign.name}
          </Typography>
        </Stack>

        {/* Pills Row */}
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            justifyContent: "flex-start",
            flexWrap: "wrap",
            gap: 1,
            mb: 2
          }}>
          <Tooltip
            title={`${campaign.currentPlayers} ${
              campaign.currentPlayers === 1 ? "player" : "players"
            } in this campaign`}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: (theme) =>
                  theme.palette.mode === "dark"
                    ? theme.palette.info.dark + "40"
                    : "info.50",
                border: "1px solid",
                borderColor: "info.200",
              }}
            >
              <GroupIcon sx={{ fontSize: 12, color: "info.main" }} />
              <Typography
                variant="caption"
                sx={{ color: "info.dark", fontWeight: 500 }}
              >
                {campaign.currentPlayers}{" "}
                {campaign.currentPlayers === 1 ? "player" : "players"}
              </Typography>
            </Box>
          </Tooltip>
          <Tooltip title={campaign.rulesetName}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: (theme) =>
                  theme.palette.mode === "dark"
                    ? theme.palette.secondary.dark + "40"
                    : "secondary.50",
                border: "1px solid",
                borderColor: "secondary.200",
                minWidth: 0,
              }}
            >
              <RulesetIcon sx={{ fontSize: 12, color: "secondary.main", flexShrink: 0 }} />
              <Typography
                variant="caption"
                noWrap
                sx={{ color: "secondary.dark", fontWeight: 500 }}
              >
                {campaign.rulesetName}
              </Typography>
            </Box>
          </Tooltip>
        </Stack>
      </Box>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.6,
            minHeight: "6.4em"
          }}>
          {campaign.description || "No description provided."}
        </Typography>
      </Box>
    </StyledCard>
  );
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { offset, updateOffset } = useStaggerAnimation();
  const isDemo = useAuthStore((s) => !!s.user?.expiresAt);
  const limit = 10;

  // Get state from URL params
  const rawView = searchParams.get("view");
  const view: "active" | "archived" = rawView === "active" || rawView === "archived" ? rawView : "active";
  const searchQuery = searchParams.get("search") || "";
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const rawOrderBy = searchParams.get("orderBy");
  const orderBy: SortField = rawOrderBy === "name" || rawOrderBy === "createdAt" || rawOrderBy === "updatedAt" ? rawOrderBy : "createdAt";
  const rawOrderDir = searchParams.get("orderDir");
  const orderDir: SortDirection = rawOrderDir === "asc" || rawOrderDir === "desc" ? rawOrderDir : "desc";

  // Update URL when filters change
  const updateURLParams = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    }

    setSearchParams(newParams);
  };

  const {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
    confirmCreate,
  } = useCampaignOperations();

  const {
    data,
    isLoading: campaignsLoading,
    error: campaignsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.campaigns.list({
      view,
      search: debouncedSearchQuery,
      orderBy,
      orderDir,
    }),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.campaigns.$get({
        query: {
          page: pageParam.toString(),
          limit: limit.toString(),
          visibility: view === "active" ? "active" : "archived",
          search: debouncedSearchQuery || undefined,
          orderBy,
          orderDir,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch campaigns");
      }

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage as CampaignPaginated).nextPage,
    placeholderData: keepPreviousData,
  });

  const handleViewChange = (newView: "active" | "archived" | undefined) => {
    updateURLParams({ view: newView || "active" });
  };

  const handleSortChange = (field: SortField, direction: SortDirection) => {
    updateURLParams({ orderBy: field, orderDir: direction });
  };

  // Flatten the pages into a single array of campaigns
  const campaigns =
    data?.pages.flatMap((page) => (page as CampaignPaginated).items) ?? [];

  if (campaignsLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: { xs: 4, sm: 8 },
          }}
        >
          <DiceSpinner />
        </Box>
      </Container>
    );
  }

  if (campaignsError) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">Failed to load campaigns.</Alert>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Header Section */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 4 },
            mb: 3,
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}15, ${theme.palette.primary.dark}15)`,
            borderRadius: 2,
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "stretch", sm: "center" }
            }}>
            <Box>
              <Typography
                gutterBottom
                sx={{ fontWeight: 700, typography: { xs: "h4", md: "h3" } }}
              >
                Campaigns
              </Typography>
              <Typography
                sx={{
                  typography: { xs: "body1", sm: "h6" },
                  color: "text.secondary",
                }}
              >
                Manage your campaigns and organize your adventuring parties
              </Typography>
            </Box>
            {!isDemo && (
              <Button
                variant="contained"
                size="large"
                startIcon={<AddIcon />}
                onClick={handleCreate}
                sx={{
                  px: 3,
                  py: 1.5,
                  borderRadius: 2,
                  boxShadow: (theme) =>
                    `0 4px 14px 0 ${theme.palette.primary.main}40`,
                }}
              >
                Create New Campaign
              </Button>
            )}
          </Stack>
        </Paper>

        <SearchBar
          searchValue={searchQuery}
          onSearchChange={(value) => updateURLParams({ search: value || null })}
          searchPlaceholder="Search campaigns..."
          filterOptions={CAMPAIGN_FILTER_OPTIONS}
          filterValue={view}
          onFilterChange={handleViewChange}
          sortOptions={CAMPAIGN_SORT_OPTIONS}
          sortField={orderBy}
          sortDirection={orderDir}
          onSortChange={handleSortChange}
        />

        {/* Campaigns Grid */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, 1fr)",
              lg: "repeat(3, 1fr)",
            },
            gap: 3,
            mb: 3,
          }}
        >
          {campaigns && campaigns.length > 0 ? (
            campaigns.map((campaign, index) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                isArchived={view === "archived"}
                animationIndex={index}
                animationOffset={offset}
              />
            ))
          ) : view === "archived" ? (
            <BlankState
              icon={
                <ArchiveIcon
                  sx={{
                    fontSize: { xs: 56, sm: 80 },
                    color: "text.secondary",
                    mb: 2,
                    opacity: 0.5,
                  }}
                />
              }
              title="No archived campaigns"
              description="Campaigns you archive will appear here. You can restore them at any time."
              action={
                <Button
                  variant="outlined"
                  onClick={() => updateURLParams({ view: "active" })}
                  sx={{
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    borderRadius: 2,
                  }}
                >
                  View Active Campaigns
                </Button>
              }
              sx={{ gridColumn: "1 / -1" }}
            />
          ) : (
            <BlankState
              icon={
                <CampaignIcon
                  sx={{
                    fontSize: { xs: 56, sm: 80 },
                    color: "text.secondary",
                    mb: 2,
                    opacity: 0.5,
                  }}
                />
              }
              title="No campaigns yet"
              description={isDemo
                ? "Sign up to create campaigns and run multiplayer sessions."
                : "Create your first campaign to start organizing your adventures"}
              action={!isDemo
                ? (
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<AddIcon />}
                    onClick={handleCreate}
                    sx={{
                      fontWeight: 600,
                      px: 4,
                      py: 1.5,
                      borderRadius: 2,
                    }}
                  >
                    Create Your First Campaign
                  </Button>
                )
                : undefined}
              sx={{ gridColumn: "1 / -1" }}
            />
          )}
        </Box>

        {hasNextPage && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <Button
              onClick={() => {
                updateOffset(campaigns.length);
                fetchNextPage();
              }}
              disabled={isFetchingNextPage}
              variant="outlined"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                borderRadius: 2,
                fontWeight: 600,
                borderWidth: 2,
                "&:hover": {
                  borderWidth: 2,
                },
              }}
            >
              <DiceSpinner size="small" loading={isFetchingNextPage}>Load More Campaigns</DiceSpinner>
            </Button>
          </Box>
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
