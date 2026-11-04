import { Box, MenuItem, Stack, TextField } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BlankState,
  LoadError,
  LoadMoreButton,
  SearchBar,
  type TableColumn,
} from "@/client/src/components/common/index.ts";
import {
  useCustomizationPages,
  useRules,
  useRulesetPermissions,
  useSearchParam,
  useSearchText,
} from "@/client/src/hooks/index.ts";
import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import type { ProgressionCounts, RulesDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { DescriptionCell, RulesetSectionTable, TierFilter } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { AddListedDialog, RemoveListedDialog } from "@/client/src/pages/rulesets/details/owners/components/index.ts";
import { kindIconOf } from "@/client/src/pages/rulesets/details/owners/ownerKind.ts";
import {
  listEntitiesQuery,
  ownerListsQuery,
  ownerProgressionQuery,
} from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import type { OwnerSectionProps } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import { useOpenEntity, useTierFilter } from "@/client/src/pages/rulesets/hooks/index.ts";
import { buildEntityPagePath } from "@/shared/customization/entities.ts";

import { readOwnList } from "./ownList.ts";
import { useOwnerListEntries } from "./useOwnerListEntries.ts";

/** What an owner's owned entities count (`counts`), and the words its tab says them in, its rules' (`rules`). */
interface OwnerListProps extends OwnerSectionProps {
  counts: ProgressionCounts;
  rules: RulesDescription;
}

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%", slot: "block" },
];

/**
 * The entities of an owner's list (3.5's spells of its spell list), at a tier and searched, each opening its
 * customization page; a picker of its lists where it counts on several, its own first. Who may edit the ruleset's
 * content adds several of its kind's entities to the list shown at once, at a tier (the one shown, to start), and
 * removes one from it, each entity written as its own page's save writes it (an inherited one copied); an owner with
 * no list yet takes its first add on its own list, which the add makes, under the name its rules give it.
 */
function OwnerList({ rulesetId, ownerId, ownerName, ownerType, ruleset, counts, rules }: OwnerListProps) {
  const openEntity = useOpenEntity();
  const queryClient = useQueryClient();
  const pages = useCustomizationPages();
  const page = pages.get(counts.type);
  const { setTier, tier } = useTierFilter(ruleset.baseRules, false);
  const { value: chosenListId, setValue: setChosenListId } = useSearchParam("list");
  const { search, searchBarProps } = useSearchText();
  const one = entityTypeLabel(counts.type, rules.words);
  const many = entityTypeLabel(counts.type, rules.words, true);
  const owner = entityTypeLabel(ownerType, rules.words).toLowerCase();
  const kind = { pools: rules.kinds.find(({ type }) => type === counts.type)?.pools, type: counts.type };
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const words = { many, one, tier: rules.tierWord.one };
  // An add shows the tier it added at
  const entries = useOwnerListEntries(rulesetId, ownerType, ownerId, counts, kind.pools?.type, words, setTier);
  const { data: progression, error: progressionError } = useQuery(ownerProgressionQuery(rulesetId, ownerType, ownerId));

  const {
    data: lists = [],
    isLoading: isLoadingLists,
    error: listsError,
  } = useQuery(ownerListsQuery(rulesetId, ownerType, ownerId, counts.lists));
  // The owner's own list opens first; one it counts on too (a pious templar's blackguard list) is picked
  const list = lists.find(({ id }) => id === chosenListId) ?? lists.at(0);
  const listId = list?.id;
  // Without a list, its own one its first add makes (none while its lists load)
  const answer: Record<string, unknown> | undefined = progression;
  const ownList = readOwnList(answer?.[counts.ownList]);
  const newList = lists.length === 0 && !isLoadingLists && ownList?.id === null ? ownList : undefined;
  const addTo = list ?? newList;

  // Another tier or search keeps the list's entities showing; without a list there's nothing to keep
  function keepListEntities<T>(previous: T | undefined) {
    return listId === undefined ? undefined : keepPreviousData(previous);
  }

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...listEntitiesQuery(rulesetId, kind, listId, tier, search),
    placeholderData: keepListEntities,
  });

  // Without a list the key is the ruleset's own "all lists" one, whose cached entities aren't this owner's
  const entities = listId === undefined ? [] : pageItems(data);

  const handleRowClick = (entity: EntityRow) => {
    openEntity(buildEntityPagePath(ruleset.id, counts.type, entity.id, pages));
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
      {/* Its own list, which a class without one adds to, is its progression's */}
      {!!progressionError && !progression && lists.length === 0 && (
        <LoadError what={`${one} List`} error={progressionError} />
      )}
      <SearchBar
        {...searchBarProps}
        searchPlaceholder={`Search ${many.toLowerCase()}…`}
        addLabel={`Add ${many}`}
        onAdd={canEdit && addTo ? () => entries.openAdd(addTo, tier) : undefined}
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
            <TierFilter baseRules={ruleset.baseRules} value={tier} onChange={setTier} />
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
          canEdit={canEdit}
          onRemove={list && ((entity: EntityRow) => entries.openRemove(entity, list))}
          renderCell={renderCell}
          empty={
            <BlankState
              icon={kindIconOf(rules, counts.type)}
              title={`No ${many.toLowerCase()}`}
              description={
                canEdit && newList
                  ? `This ${owner} has no ${one.toLowerCase()} list yet: adding ${many.toLowerCase()} makes ${newList.name}.`
                  : lists.length === 0 && !isLoadingLists
                    ? `This ${owner} has no ${one.toLowerCase()} list of its own.`
                    : `No ${many.toLowerCase()} found for this ${owner} at the selected ${rules.tierWord.one.toLowerCase()}.`
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
      <AddListedDialog
        open={entries.addDialog.open}
        onClose={entries.addDialog.close}
        onExited={entries.addDialog.onExited}
        list={entries.addDialog.target}
        ownerName={ownerName}
        form={entries.form}
        onSubmit={entries.handleAdd}
        pending={entries.addMutation.isPending}
        role={kind.pools?.role}
        rulesetId={rulesetId}
        tiers={rules.tiers}
        type={counts.type}
        words={words}
      />
      <RemoveListedDialog
        open={entries.removeDialog.open}
        onClose={entries.removeDialog.close}
        onConfirm={entries.confirmRemove}
        pending={entries.removeMutation.isPending}
        entityName={entries.removeDialog.target?.entity.name}
        listName={entries.removeDialog.target?.list.name}
        restorable={!!entries.removeDialog.target?.restorable}
        words={words}
      />
    </Stack>
  );
}

/**
 * An owner's list tab (its rules' progression's `counts`: 3.5's Spell List): the entities of the list its levels count
 * on; none where its rules count none.
 */
export function OwnerListSection({ ruleset, ...props }: OwnerSectionProps) {
  const { rules } = useRules(ruleset.baseRules);
  const counts = rules?.progression.counts;
  if (!rules || !counts) return null;
  return <OwnerList {...props} ruleset={ruleset} counts={counts} rules={rules} />;
}
