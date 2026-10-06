import { Button } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { characterTags } from "@/client/src/components/characters/index.ts";
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
  PageBody,
  PageHeader,
  SearchBar,
  type SortOption,
  UPDATED_SORTS,
} from "@/client/src/components/common/index.ts";
import { ArchiveIcon, CharactersIcon, ContributorsIcon } from "@/client/src/components/icons/index.ts";
import { useAttachments, useListParams, usePageTitle, useStaggerOffset } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { characterDetailQuery, type CharacterListFilters, characterListQuery } from "@/client/src/lib/queries.ts";
import { CreateCharacterDialog } from "@/client/src/pages/characters/components/index.ts";

type CharacterView = CharacterListFilters["view"];
type SortField = CharacterListFilters["orderBy"];

const CHARACTER_FILTER_OPTIONS: FilterOption<CharacterView>[] = [
  { value: "active", label: "Active" },
  { value: "shared", label: "Shared" },
  { value: "archived", label: "Archived" },
];

const CHARACTER_SORT_OPTIONS: SortOption<SortField>[] = [...NAME_SORTS, ...CREATED_SORTS, ...UPDATED_SORTS];

export default function CharactersPage() {
  usePageTitle("Characters");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ["name", "createdAt", "updatedAt"],
    { orderBy: "createdAt", orderDir: "desc" },
  );

  const view = oneOf(searchParams.get("view"), ["active", "shared", "archived"], "active");

  const listQuery = characterListQuery({ view, search, orderBy, orderDir });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...listQuery,
    placeholderData: keepPreviousData,
  });

  const characters = useMemo(() => pageItems(data), [data]);
  const offset = useStaggerOffset(characters);

  const characterIds = useMemo(() => characters.map((c) => c.id), [characters]);
  const { data: portraitsByCharacterId } = useAttachments({
    recordType: "Character",
    name: "portrait",
    recordIds: characterIds,
  });

  const prefetchCharacter = (id: string) => void queryClient.prefetchQuery(characterDetailQuery(id));

  const createButton = (label: string) => (
    <PageActionButton onClick={() => setCreateModalOpen(true)}>{label}</PageActionButton>
  );

  const viewActiveButton = (
    <Button variant="outlined" onClick={() => updateSearchParams({ view: null })}>
      View Active Characters
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        variant="tinted"
        title="Characters"
        subtitle="View and manage your character collection"
        action={createButton("Create Character")}
      />

      <SearchBar
        {...searchBarProps}
        searchPlaceholder="Search characters..."
        filterOptions={CHARACTER_FILTER_OPTIONS}
        filterValue={view}
        onFilterChange={(value) => updateSearchParams({ view: value })}
        sortOptions={CHARACTER_SORT_OPTIONS}
      />

      {isLoading ? (
        <DiceSpinner sx={{ py: { xs: 4, sm: 8 } }} />
      ) : error ? (
        <LoadError what="Characters" error={error} />
      ) : characters.length > 0 ? (
        <>
          <ListCardGrid>
            {characters.map((character, index) => (
              <ListCard
                key={character.id}
                isArchived={view === "archived"}
                animationIndex={index}
                animationOffset={offset}
                onClick={() => navigate(`/characters/${character.id}`)}
                onMouseEnter={() => prefetchCharacter(character.id)}
                onFocus={() => prefetchCharacter(character.id)}
                avatarSrc={portraitsByCharacterId.get(character.id) ?? undefined}
                title={character.name}
                description={character.description}
                tags={characterTags({
                  race: character.race,
                  levels: character.levels,
                  shared: character.accessRole === "contributor",
                })}
              />
            ))}
          </ListCardGrid>
          <LoadMoreButton
            size="large"
            label="Load More Characters"
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
          title="No archived characters"
          description="Characters you archive will appear here. You can restore them at any time."
          action={viewActiveButton}
        />
      ) : view === "shared" ? (
        <BlankState
          icon={ContributorsIcon}
          title="No shared characters"
          description="Characters other users invite you to contribute to will appear here."
          action={viewActiveButton}
        />
      ) : (
        <BlankState
          icon={CharactersIcon}
          title="No characters yet"
          description="Create your first character to start your adventure"
          action={createButton("Create Your First Character")}
        />
      )}

      <CreateCharacterDialog open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    </PageBody>
  );
}
