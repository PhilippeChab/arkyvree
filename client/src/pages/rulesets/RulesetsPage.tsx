import {
  BlankState,
  PageTransition,
  SearchBar,
  StyledCard,
  DiceSpinner,
  type FilterOption,
  type SortOption,
} from "@/client/src/components/common/index.ts";
import { useDebouncedValue, usePageTitle, useStaggerAnimation } from "@/client/src/hooks/index.ts";
import { useRulesetOperations } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Archive as ArchiveIcon,
  CheckCircle as PublishedIcon,
  ContentCopy as ForkIcon,
  EditNote as DraftIcon,
  Extension as ExtensionIcon,
  Lock as LockIcon,
  MenuBook as BookIcon,
  Public as PublicIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Container,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type FilterScope = "base" | "forked" | "community" | "archived" | "starred" | "campaignAccessible" | "extensions" | "systems";
type SortField = "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";

const RULESET_FILTER_OPTIONS: FilterOption<FilterScope>[] = [
  { value: undefined, label: "All" },
  { value: "base", label: "Base" },
  { value: "extensions", label: "Extensions" },
  { value: "systems", label: "Systems" },
  { value: "community", label: "Community" },
  { value: "forked", label: "Forked" },
  { value: "campaignAccessible", label: "Invited" },
  { value: "starred", label: "Starred" },
  { value: "archived", label: "Archived" },
];

const RULESET_SORT_OPTIONS: SortOption<SortField>[] = [
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
  { field: "updatedAt", direction: "desc", label: "Recently Updated" },
  { field: "updatedAt", direction: "asc", label: "Least Recently Updated" },
];

function getStatusPill(status: "Draft" | "Published" | "Archived") {
  switch (status) {
    case "Draft":
      return (
        <Tooltip title="Fully editable — add, edit, and delete entities. Only visible to you until published.">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: (theme) =>
                theme.palette.mode === "dark" ? theme.palette.info.dark + "40" : "info.50",
              border: "1px solid",
              borderColor: "info.200",
            }}
          >
            <DraftIcon sx={{ fontSize: 12, color: "info.main" }} />
            <Typography
              variant="caption"
              sx={{ color: "info.dark", fontWeight: 500 }}
            >
              Draft
            </Typography>
          </Box>
        </Tooltip>
      );
    case "Published":
      return (
        <Tooltip title="Available for others to use and fork. You can still add or edit, but can no longer delete entities.">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: (theme) =>
                theme.palette.mode === "dark" ? theme.palette.success.dark + "40" : "success.50",
              border: "1px solid",
              borderColor: "success.200",
            }}
          >
            <PublishedIcon sx={{ fontSize: 12, color: "success.main" }} />
            <Typography
              variant="caption"
              sx={{ color: "success.dark", fontWeight: 500 }}
            >
              Published
            </Typography>
          </Box>
        </Tooltip>
      );
    case "Archived":
      return (
        <Tooltip title="Read-only. Can be un-archived later.">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: (theme) =>
                theme.palette.mode === "dark" ? theme.palette.grey[700] + "40" : "grey.100",
              border: "1px solid",
              borderColor: "grey.300",
            }}
          >
            <ArchiveIcon sx={{ fontSize: 12, color: "grey.600" }} />
            <Typography
              variant="caption"
              sx={{ color: "grey.700", fontWeight: 500 }}
            >
              Archived
            </Typography>
          </Box>
        </Tooltip>
      );
  }
}

function RulesetList({
  scope,
  search,
  orderBy,
  orderDir,
  limit,
}: {
  scope?: FilterScope;
  search: string;
  orderBy: SortField;
  orderDir: SortDirection;
  limit: number;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { offset, updateOffset } = useStaggerAnimation();

  const prefetchRuleset = useCallback((id: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.detail(id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].$get({ param: { id } });
        if (!response.ok) throw new Error("Failed to fetch ruleset");
        return response.json();
      },
    });
    queryClient.prefetchInfiniteQuery({
      queryKey: [...queryKeys.rulesets.section(id, "races"), ""],
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].races.$get({
          param: { id },
          query: { page: "1", limit: "10" },
        });
        if (!response.ok) throw new Error("Failed to fetch races");
        return response.json();
      },
      initialPageParam: 1,
    });
  }, [queryClient]);

  const {
    toggleStar,
  } = useRulesetOperations();

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.rulesets.list({ scope, search, orderBy, orderDir }),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (scope) params.append("scope", scope);
      if (search) params.append("search", search);
      if (orderBy) params.append("orderBy", orderBy);
      if (orderDir) params.append("orderDir", orderDir);
      params.append("page", pageParam.toString());
      params.append("limit", limit.toString());

      const response = await rpc.api.rulesets.$get({
        query: Object.fromEntries(params),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch rulesets");
      }

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: keepPreviousData,
  });

  // Flatten the pages into a single array of rulesets
  const rulesets = data?.pages.flatMap(({ items }) => items) ?? [];

  return (
    <>
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
        {isLoading
          ? (
            <Box sx={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", py: { xs: 4, sm: 8 } }}>
              <DiceSpinner />
            </Box>
          )
          : error
          ? (
            <Box sx={{ gridColumn: "1 / -1", py: { xs: 4, sm: 8 } }}>
              <Alert severity="error">Failed to load rulesets</Alert>
            </Box>
          )
          : rulesets.length === 0
          ? (
            <BlankState
              icon={<BookIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
              title="No rulesets found"
              description="Try adjusting your search or filters, or fork a base ruleset"
              sx={{ gridColumn: "1 / -1" }}
            />
          )
          : (
            rulesets.map((ruleset, index) => (
              <StyledCard
                key={ruleset.id}
                isPrivate={ruleset.private}
                isArchived={ruleset.status === "Archived"}
                animationIndex={index}
                animationOffset={offset}
                onClick={() => navigate(`/rulesets/${ruleset.id}`)}
                onMouseEnter={() => prefetchRuleset(ruleset.id)}
                onFocus={() => prefetchRuleset(ruleset.id)}
              >
                <Box sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 1.5, sm: 2 }, position: "relative" }}>
                  {ruleset.isStarrable && (
                    <Stack
                      direction="row"
                      spacing={0.25}
                      sx={{
                        alignItems: "center",
                        position: "absolute",
                        top: 8,
                        right: 8
                      }}>
                      {ruleset.starCount > 0 && (
                        <Typography variant="caption" sx={{ color: "warning.main", fontWeight: 600, lineHeight: 1 }}>
                          {ruleset.starCount}
                        </Typography>
                      )}
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(ruleset.id, ruleset.isStarred);
                        }}
                        sx={{
                          color: ruleset.isStarred ? "warning.main" : "action.disabled",
                          "&:hover": {
                            color: "warning.main",
                          },
                        }}
                      >
                        {ruleset.isStarred ? <StarIcon /> : <StarBorderIcon />}
                      </IconButton>
                    </Stack>
                  )}

                  {/* Title Row with Avatar */}
                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{
                      alignItems: "center",
                      mb: 1.5,
                      minWidth: 0,
                      pr: 4
                    }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        border: "2px solid",
                        borderColor: "secondary.main",
                        background: (theme) =>
                          `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
                        flexShrink: 0,
                      }}
                    >
                      <BookIcon sx={{ fontSize: 18 }} />
                    </Avatar>
                    <Typography
                      variant="h6"
                      noWrap
                      sx={{
                        fontWeight: 600,
                        color: "text.primary",
                        lineHeight: 1.3,
                        textAlign: "left",
                        flex: 1,
                      }}
                    >
                      {ruleset.name}
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
                    {getStatusPill(ruleset.status)}
                    {ruleset.private
                      ? (
                        <Tooltip title="Private ruleset">
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
                                  ? theme.palette.warning.dark + "40"
                                  : "warning.50",
                              border: "1px solid",
                              borderColor: "warning.200",
                            }}
                          >
                            <LockIcon sx={{ fontSize: 12, color: "warning.main" }} />
                            <Typography
                              variant="caption"
                              sx={{ color: "warning.dark", fontWeight: 500 }}
                            >
                              Private
                            </Typography>
                          </Box>
                        </Tooltip>
                      )
                      : (
                        <Tooltip title="Public ruleset">
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
                                  ? theme.palette.success.dark + "40"
                                  : "success.50",
                              border: "1px solid",
                              borderColor: "success.200",
                            }}
                          >
                            <PublicIcon sx={{ fontSize: 12, color: "success.main" }} />
                            <Typography
                              variant="caption"
                              sx={{ color: "success.dark", fontWeight: 500 }}
                            >
                              Public
                            </Typography>
                          </Box>
                        </Tooltip>
                      )}
                    {ruleset.kind === "extension" ? (
                      <Tooltip title={!ruleset.userId ? "Official Extension" : "Extension"}>
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
                          }}
                        >
                          <ExtensionIcon sx={{ fontSize: 12, color: "secondary.main" }} />
                          <Typography
                            variant="caption"
                            sx={{ color: "secondary.dark", fontWeight: 500 }}
                          >
                            Extension
                          </Typography>
                        </Box>
                      </Tooltip>
                    ) : ruleset.rulesetId && (
                      <Tooltip title={`Forked from ${ruleset.rulesetName}`}>
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
                          <ForkIcon sx={{ fontSize: 12, color: "info.main" }} />
                          <Typography
                            variant="caption"
                            sx={{ color: "info.dark", fontWeight: 500 }}
                          >
                            Fork
                          </Typography>
                        </Box>
                      </Tooltip>
                    )}
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
                    {ruleset.description || "No description provided."}
                  </Typography>
                </Box>

              </StyledCard>
            ))
          )}
      </Box>
      {hasNextPage && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Button
            onClick={() => {
              updateOffset(rulesets.length);
              fetchNextPage();
            }}
            disabled={isFetchingNextPage}
          >
            <DiceSpinner size="small" loading={isFetchingNextPage}>Load More</DiceSpinner>
          </Button>
        </Box>
      )}
    </>
  );
}

export default function RulesetsPage() {
  usePageTitle("Rulesets");
  const [searchParams, setSearchParams] = useSearchParams();

  // Get state from URL params
  const searchQuery = searchParams.get("search") || "";
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const rawScope = searchParams.get("scope");
  const scope: FilterScope | undefined = rawScope === "base" || rawScope === "forked" || rawScope === "community" || rawScope === "archived" || rawScope === "starred" || rawScope === "campaignAccessible" || rawScope === "extensions" || rawScope === "systems" ? rawScope : undefined;
  const rawOrderBy = searchParams.get("orderBy");
  const orderBy: SortField = rawOrderBy === "createdAt" || rawOrderBy === "updatedAt" ? rawOrderBy : "createdAt";
  const rawOrderDir = searchParams.get("orderDir");
  const orderDir: SortDirection = rawOrderDir === "asc" || rawOrderDir === "desc" ? rawOrderDir : "desc";
  const limit = 10;

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

  const handleScopeChange = (newScope: FilterScope | undefined) => {
    updateURLParams({ scope: newScope || null });
  };

  const handleSortChange = (field: SortField, direction: SortDirection) => {
    updateURLParams({ orderBy: field, orderDir: direction });
  };

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
        <Box>
          <Typography gutterBottom sx={{ fontWeight: 700, typography: { xs: "h4", md: "h3" } }}>
            Game Rulesets
          </Typography>
          <Typography sx={{ typography: { xs: "body1", sm: "h6" }, color: "text.secondary" }}>
            Choose your adventure system and dive into infinite possibilities
          </Typography>
        </Box>
      </Paper>

      <SearchBar
        searchValue={searchQuery}
        onSearchChange={(value) => updateURLParams({ search: value || null })}
        searchPlaceholder="Search rulesets..."
        filterOptions={RULESET_FILTER_OPTIONS}
        filterValue={scope}
        onFilterChange={handleScopeChange}
        sortOptions={RULESET_SORT_OPTIONS}
        sortField={orderBy}
        sortDirection={orderDir}
        onSortChange={handleSortChange}
      />

      {/* Ruleset List */}
      <RulesetList
        scope={scope}
        search={debouncedSearchQuery}
        orderBy={orderBy}
        orderDir={orderDir}
        limit={limit}
      />

    </Container>
    </PageTransition>
  );
}
