import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  BlankState,
  InfoPill,
  ListCard,
  ListCardGrid,
  LoadMoreButton,
  PageHeader,
  PageTransition,
  SearchBar,
  DiceSpinner,
  type FilterOption,
  type SortOption,
  CREATED_SORTS,
  UPDATED_SORTS,
  NoMatchesState,
} from "@/client/src/components/common/index.ts";
import { usePageTitle, useStaggerAnimation, useListParams } from "@/client/src/hooks/index.ts";
import { prefetchSection } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useToggleRulesetStar } from "@/client/src/pages/rulesets/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { rulesetDetailQuery, rulesetListQuery, type RulesetListFilters } from "@/client/src/lib/queries.ts";
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
  Container,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

const SCOPES = ["base", "extensions", "systems", "community", "forked", "campaignAccessible", "starred", "archived"] as const;
type FilterScope = (typeof SCOPES)[number];
type SortField = RulesetListFilters["orderBy"];

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

const RULESET_SORT_OPTIONS: SortOption<SortField>[] = [...CREATED_SORTS, ...UPDATED_SORTS];

const STATUS_PILLS = {
  Draft: {
    icon: DraftIcon,
    color: "info",
    tooltip: "Fully editable — add, edit, and delete entities. Only visible to you until published.",
  },
  Published: {
    icon: PublishedIcon,
    color: "success",
    tooltip: "Available for others to use and fork. You can still add, edit, and delete entities — characters that depend on a deletion will block it.",
  },
  Archived: {
    icon: ArchiveIcon,
    color: "default",
    tooltip: "Read-only. Can be un-archived later.",
  },
} as const;

function RulesetList({ filters }: { filters: RulesetListFilters }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toggleStar = useToggleRulesetStar();

  const listQuery = rulesetListQuery(filters);
  const { offset, updateOffset } = useStaggerAnimation(listQuery.queryKey);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...listQuery,
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const rulesets = pageItems(data);

  if (isLoading) {
    return (
      <DiceSpinner sx={{ py: { xs: 4, sm: 8 } }} />
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load rulesets</Alert>;
  }

  if (rulesets.length === 0) {
    return filters.search ? (
      <NoMatchesState search={filters.search} />
    ) : (
      <BlankState
        icon={BookIcon}
        title="No rulesets found"
        description="Try another filter, or fork a base ruleset"
      />
    );
  }

  return (
    <>
      <ListCardGrid>
        {rulesets.map((ruleset, index) => {
          const status = STATUS_PILLS[ruleset.status];
          // The page opens on the Races tab, with "Local changes" on for extensions.
          const prefetch = () => {
            void queryClient.prefetchQuery(rulesetDetailQuery(ruleset.id));
            void prefetchSection(queryClient, ruleset.id, "races", ruleset.kind === "extension");
          };
          return (
            <ListCard
              key={ruleset.id}
              isPrivate={ruleset.private}
              isArchived={ruleset.status === "Archived"}
              animationIndex={index}
              animationOffset={offset}
              onClick={() => navigate(`/rulesets/${ruleset.id}`)}
              onMouseEnter={prefetch}
              onFocus={prefetch}
              avatar={<BookIcon sx={{ fontSize: 18 }} />}
              title={ruleset.name}
              description={ruleset.description}
              corner={ruleset.isStarrable && (
                <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
                  {ruleset.starCount > 0 && (
                    <Typography variant="caption" sx={{ color: "warning.main", fontWeight: 600, lineHeight: 1 }}>
                      {ruleset.starCount}
                    </Typography>
                  )}
                  <IconButton
                    size="small"
                    aria-label={ruleset.isStarred ? "Unstar ruleset" : "Star ruleset"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(ruleset.id, ruleset.isStarred);
                    }}
                    sx={{
                      color: ruleset.isStarred ? "warning.main" : "action.disabled",
                      "&:hover": { color: "warning.main" },
                    }}
                  >
                    {ruleset.isStarred ? <StarIcon /> : <StarBorderIcon />}
                  </IconButton>
                </Stack>
              )}
              pills={(
                <>
                  <InfoPill icon={status.icon} label={ruleset.status} color={status.color} tooltip={status.tooltip} />
                  {ruleset.private
                    ? <InfoPill icon={LockIcon} label="Private" color="warning" tooltip="Private ruleset" />
                    : <InfoPill icon={PublicIcon} label="Public" color="success" tooltip="Public ruleset" />}
                  {ruleset.kind === "extension" ? (
                    <InfoPill
                      icon={ExtensionIcon}
                      label="Extension"
                      color="secondary"
                      tooltip={ruleset.userId ? "Extension" : "Official Extension"}
                    />
                  ) : ruleset.rulesetId && (
                    <InfoPill icon={ForkIcon} label="Fork" color="info" tooltip={`Forked from ${ruleset.rulesetName}`} />
                  )}
                </>
              )}
            />
          );
        })}
      </ListCardGrid>
      <LoadMoreButton
        size="large"
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => {
          updateOffset(rulesets.length);
          fetchNextPage();
        }}
      />
    </>
  );
}

export default function RulesetsPage() {
  usePageTitle("Rulesets");
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ["createdAt", "updatedAt"],
    { orderBy: "createdAt", orderDir: "desc" },
  );

  const scope = oneOf(searchParams.get("scope"), SCOPES);

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageHeader
          variant="tinted"
          title="Game Rulesets"
          subtitle="Choose your adventure system and dive into infinite possibilities"
        />

        <SearchBar
          {...searchBarProps}
          searchPlaceholder="Search rulesets..."
          filterOptions={RULESET_FILTER_OPTIONS}
          filterValue={scope}
          onFilterChange={(value) => updateSearchParams({ scope: value })}
          sortOptions={RULESET_SORT_OPTIONS}
        />

        <RulesetList filters={{ scope, search, orderBy, orderDir }} />
      </Container>
    </PageTransition>
  );
}
