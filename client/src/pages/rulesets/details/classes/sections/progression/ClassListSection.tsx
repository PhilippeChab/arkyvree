import { Box, MenuItem, Stack, TextField } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { BlankState, LoadMoreButton, SearchBar, type TableColumn } from "@/client/src/components/common/index.ts";
import { useCustomizationPages, useRules, useSearchParam, useSearchText } from "@/client/src/hooks/index.ts";
import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import type { ProgressionCounts, RulesDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { DescriptionCell, RulesetSectionTable, TierFilter } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { kindIconOf } from "@/client/src/pages/rulesets/details/classes/classKind.ts";
import { classListsQuery, listEntitiesQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classTab.ts";
import { useOpenEntity, useTierFilter } from "@/client/src/pages/rulesets/hooks/index.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

/** What a class's levels count (`counts`), and the words its tab says them in, its rules' (`rules`). */
interface ClassListProps extends ClassSectionProps {
  counts: ProgressionCounts;
  rules: RulesDescription;
}

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%", slot: "block" },
];

/**
 * The entities of a class's list (3.5's spells of its spell list), at a tier and searched, each opening its
 * customization page; a picker of its lists where it counts on several, its own first.
 */
function ClassList({ rulesetId, classId, classType, ruleset, counts, rules }: ClassListProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();
  const page = useCustomizationPages().get(counts.type);
  const { level, setLevel } = useTierFilter(ruleset.baseRules, false);
  const { value: chosenListId, setValue: setChosenListId } = useSearchParam("list");
  const { search, searchBarProps } = useSearchText();
  const one = entityTypeLabel(counts.type, rules.words);
  const many = entityTypeLabel(counts.type, rules.words, true);
  const owner = entityTypeLabel(classType, rules.words).toLowerCase();
  const kind = { pools: rules.kinds.find(({ type }) => type === counts.type)?.pools, type: counts.type };

  const {
    data: lists = [],
    isLoading: isLoadingLists,
    error: listsError,
  } = useQuery(classListsQuery(rulesetId, classType, classId, counts.lists));
  // The class's own list opens first; one it counts on too (a pious templar's blackguard list) is picked
  const listId = lists.some((list) => list.id === chosenListId) ? chosenListId : lists[0]?.id;

  // Another level or search keeps the list's entities showing; without a list there's nothing to keep
  function keepListEntities<T>(previous: T | undefined) {
    return listId === undefined ? undefined : keepPreviousData(previous);
  }

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...listEntitiesQuery(rulesetId, kind, listId, level, search),
    placeholderData: keepListEntities,
  });

  // Without a list the key is the ruleset's own "all lists" one, whose cached entities aren't this class's
  const entities = listId === undefined ? [] : pageItems(data);

  const handleRowClick = (entity: EntityRow) => {
    openEntity(buildCustomizationPath(counts.type, entity.id));
  };

  const handleRowPrefetch = (entity: EntityRow) => {
    void queryClient.prefetchQuery(customizationEntityQuery(rulesetId, page, entity.id));
  };

  const renderCell = (entity: EntityRow, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return entity.name;
      case "description":
        return <DescriptionCell text={entity.description} />;
      default:
        return null;
    }
  };

  return (
    <Stack spacing={3}>
      <SearchBar
        {...searchBarProps}
        searchPlaceholder={`Search ${many.toLowerCase()}…`}
        filters={
          <>
            {lists.length > 1 && (
              <Box sx={{ width: { xs: "100%", md: 200 } }}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={`${one} List`}
                  value={listId ?? ""}
                  onChange={(e) => setChosenListId(e.target.value)}
                >
                  {lists.map((list) => (
                    <MenuItem key={list.id} value={list.id}>
                      {list.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            )}
            <TierFilter baseRules={ruleset.baseRules} value={level} onChange={setLevel} />
          </>
        }
      />

      <Stack spacing={2}>
        <RulesetSectionTable
          what={many}
          error={listsError ?? error}
          data={entities}
          animationOffset={itemsBeforeLastPage(data)}
          search={search}
          isLoading={isLoadingLists || isLoading}
          columns={COLUMNS}
          onRowClick={handleRowClick}
          onRowPrefetch={handleRowPrefetch}
          renderCell={renderCell}
          empty={
            <BlankState
              icon={kindIconOf(rules, counts.type)}
              title={`No ${many.toLowerCase()}`}
              description={
                lists.length === 0 && !isLoadingLists
                  ? `This ${owner} has no ${one.toLowerCase()} list of its own.`
                  : `No ${many.toLowerCase()} found for this ${owner} at the selected level.`
              }
            />
          }
        />

        <LoadMoreButton
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        />
      </Stack>
    </Stack>
  );
}

/**
 * A class's list tab (its rules' progression's `counts`: 3.5's Spell List): the entities of the list its levels count
 * on; none where its rules count none.
 */
export function ClassListSection({ ruleset, ...props }: ClassSectionProps) {
  const { rules } = useRules(ruleset.baseRules);
  const counts = rules?.progression.counts;
  if (!rules || !counts) return null;
  return <ClassList {...props} ruleset={ruleset} counts={counts} rules={rules} />;
}
