import { Container, IconButton, Stack, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  BlankState,
  CREATED_SORTS,
  type FilterOption,
  ListCard,
  ListCardGrid,
  ListPageResults,
  PageHeader,
  PageTransition,
  SearchBar,
  type SortOption,
  UPDATED_SORTS,
} from "@/client/src/components/common/index.ts";
import { RulesetIcon, StarBorderIcon, StarIcon } from "@/client/src/components/icons/index.ts";
import { useListPageQuery, useListParams, usePageTitle } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import {
  RULESET_LIST_DEFAULTS,
  rulesetDetailQuery,
  type RulesetListFilters,
  rulesetListQuery,
} from "@/client/src/lib/queries.ts";

import { RulesetFactChips } from "./components/index.ts";
import { prefetchSection } from "./details/sectionQueries.ts";
import { useToggleRulesetStar } from "./hooks/index.ts";

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

const SCOPES = [
  "base",
  "extensions",
  "systems",
  "community",
  "forked",
  "campaignAccessible",
  "starred",
  "archived",
] as const;

export default function RulesetsPage() {
  usePageTitle("Rulesets");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toggleStar = useToggleRulesetStar();
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ["createdAt", "updatedAt"],
    RULESET_LIST_DEFAULTS,
  );

  const scope = oneOf(searchParams.get("scope"), SCOPES);
  const rulesets = useListPageQuery(rulesetListQuery({ scope, search, orderBy, orderDir }));

  return (
    <PageTransition>
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <PageHeader
            variant="tinted"
            title="Game Rulesets"
            subtitle="Choose your adventure system and dive into infinite possibilities"
          />

          <Stack spacing={3}>
            <SearchBar
              {...searchBarProps}
              searchPlaceholder="Search rulesets…"
              filterOptions={RULESET_FILTER_OPTIONS}
              filterValue={scope}
              onFilterChange={(value) => updateSearchParams({ scope: value })}
              sortOptions={RULESET_SORT_OPTIONS}
            />

            <ListPageResults
              list={rulesets}
              what="Rulesets"
              search={search}
              empty={
                <BlankState
                  icon={RulesetIcon}
                  title="No rulesets found"
                  description="Try another filter, or fork a base ruleset"
                />
              }
            >
              <ListCardGrid>
                {rulesets.items.map((ruleset, index) => {
                  // The page opens on the Races tab, with "Local Changes" on for extensions.
                  const prefetch = () => {
                    void queryClient.prefetchQuery(rulesetDetailQuery(ruleset.id));
                    void prefetchSection(queryClient, ruleset.id, "races", ruleset.kind === "extension");
                  };
                  // Its fork's chip opens the ruleset it was forked from
                  const prefetchParent = () => {
                    if (ruleset.rulesetId) void queryClient.prefetchQuery(rulesetDetailQuery(ruleset.rulesetId));
                  };
                  return (
                    <ListCard
                      key={ruleset.id}
                      isArchived={ruleset.status === "Archived"}
                      animationIndex={index}
                      animationOffset={rulesets.offset}
                      onClick={() => navigate(`/rulesets/${ruleset.id}`)}
                      onMouseEnter={prefetch}
                      onFocus={prefetch}
                      avatar={<RulesetIcon sx={{ fontSize: 18 }} />}
                      title={ruleset.name}
                      description={ruleset.description}
                      corner={
                        ruleset.isStarrable && (
                          <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
                            {ruleset.starCount > 0 && (
                              <Typography
                                variant="caption"
                                sx={{ color: "warning.main", fontWeight: 600, lineHeight: 1 }}
                              >
                                {ruleset.starCount}
                              </Typography>
                            )}
                            <IconButton
                              size="small"
                              aria-label="Star Ruleset"
                              aria-pressed={ruleset.isStarred}
                              onClick={() => toggleStar(ruleset.id, ruleset.isStarred)}
                              sx={{
                                color: ruleset.isStarred ? "warning.main" : "action.disabled",
                                "&:hover": { color: "warning.main" },
                              }}
                            >
                              {ruleset.isStarred ? <StarIcon /> : <StarBorderIcon />}
                            </IconButton>
                          </Stack>
                        )
                      }
                      chips={<RulesetFactChips ruleset={ruleset} onPrefetchParent={prefetchParent} />}
                    />
                  );
                })}
              </ListCardGrid>
            </ListPageResults>
          </Stack>
        </Stack>
      </Container>
    </PageTransition>
  );
}
