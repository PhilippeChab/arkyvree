import { Button, Container, Stack } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { CharacterBuildChips } from "@/client/src/components/characters/index.ts";
import {
  BlankState,
  CREATED_SORTS,
  type FilterOption,
  ListCard,
  ListCardGrid,
  ListPageResults,
  NAME_SORTS,
  PageActionButton,
  PageHeader,
  PageTransition,
  SearchBar,
  type SortOption,
  StatusChip,
  UPDATED_SORTS,
} from "@/client/src/components/common/index.ts";
import { ArchiveIcon, CharacterIcon, ContributorsIcon } from "@/client/src/components/icons/index.ts";
import {
  useCharacterPortraits,
  useDialogState,
  useListPageQuery,
  useListParams,
  usePageTitle,
} from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import {
  CHARACTER_LIST_DEFAULTS,
  characterDetailQuery,
  type CharacterListFilters,
  characterListQuery,
} from "@/client/src/lib/queries.ts";

import { CreateCharacterDialog } from "./components/index.ts";

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
  // Mounted as it opens: the create dialog keeps its form, its pickers and its roll method
  const createDialog = useDialogState();
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ["name", "createdAt", "updatedAt"],
    CHARACTER_LIST_DEFAULTS,
  );

  const view = oneOf(searchParams.get("view"), ["active", "shared", "archived"], CHARACTER_LIST_DEFAULTS.view);

  const characters = useListPageQuery(characterListQuery({ view, search, orderBy, orderDir }));
  const portraitsByCharacterId = useCharacterPortraits(characters.items);

  const prefetchCharacter = (id: string) => void queryClient.prefetchQuery(characterDetailQuery(id));

  const createButton = (label: string) => (
    <PageActionButton label={label} onClick={() => createDialog.openWith(true)} />
  );

  const viewActiveButton = (
    <Button variant="outlined" onClick={() => updateSearchParams({ view: null })}>
      View Active Characters
    </Button>
  );

  return (
    <PageTransition>
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <PageHeader
            variant="tinted"
            title="Characters"
            subtitle="View and manage your character collection"
            action={createButton("Create Character")}
          />

          <Stack spacing={3}>
            <SearchBar
              {...searchBarProps}
              searchPlaceholder="Search characters…"
              filterOptions={CHARACTER_FILTER_OPTIONS}
              filterValue={view}
              onFilterChange={(value) => updateSearchParams({ view: value })}
              sortOptions={CHARACTER_SORT_OPTIONS}
            />

            <ListPageResults
              list={characters}
              what="Characters"
              search={search}
              empty={
                view === "archived" ? (
                  <BlankState
                    icon={ArchiveIcon}
                    title="No archived characters"
                    description="Characters you archive will appear here. You can unarchive them at any time."
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
                    icon={CharacterIcon}
                    title="No characters yet"
                    description="Create your first character to start your adventure"
                    action={createButton("Create Your First Character")}
                  />
                )
              }
            >
              <ListCardGrid>
                {characters.items.map((character, index) => (
                  <ListCard
                    key={character.id}
                    isArchived={view === "archived"}
                    animationIndex={index}
                    animationOffset={characters.offset}
                    onClick={() => navigate(`/characters/${character.id}`)}
                    onMouseEnter={() => prefetchCharacter(character.id)}
                    onFocus={() => prefetchCharacter(character.id)}
                    avatarSrc={portraitsByCharacterId.get(character.id) ?? undefined}
                    title={character.name}
                    description={character.description}
                    chips={
                      <>
                        {character.accessRole === "contributor" && <StatusChip label="Shared" color="info" />}
                        <CharacterBuildChips race={character.race} levels={character.levels} />
                      </>
                    }
                  />
                ))}
              </ListCardGrid>
            </ListPageResults>
          </Stack>
        </Stack>
        {createDialog.target && (
          <CreateCharacterDialog
            open={createDialog.open}
            onClose={createDialog.close}
            onExited={createDialog.onExited}
          />
        )}
      </Container>
    </PageTransition>
  );
}
