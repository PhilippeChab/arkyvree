import { Button, Container, Menu, Stack } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { CharacterBuildChips } from "@/client/src/components/characters/index.ts";
import {
  ActionMenuItem,
  BlankState,
  CHANGED_SORTS,
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
} from "@/client/src/components/common/index.ts";
import {
  ArchiveIcon,
  CharacterIcon,
  ContributorsIcon,
  ImportIcon,
  PersonAddIcon,
} from "@/client/src/components/icons/index.ts";
import {
  useAnchorMenu,
  useCharacterPortraits,
  useDialogState,
  useListPageQuery,
  useListParams,
  usePageTitle,
} from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import {
  CHARACTER_LIST_DEFAULTS,
  CHARACTER_VIEWS,
  characterDetailQuery,
  type CharacterListFilters,
  characterListQuery,
} from "@/client/src/lib/queries.ts";

import type { CharacterImport } from "./characterQueries.ts";
import { CreateCharacterDialog, ImportCharacterDialog, ImportReportDialog } from "./components/index.ts";

type CharacterView = CharacterListFilters["view"];
type SortField = CharacterListFilters["orderBy"];

const CHARACTER_FILTER_OPTIONS: FilterOption<CharacterView>[] = [
  { value: "active", label: "Active" },
  { value: "shared", label: "Shared" },
  { value: "archived", label: "Archived" },
];

const CHARACTER_SORT_OPTIONS: SortOption<SortField>[] = [...NAME_SORTS, ...CREATED_SORTS, ...CHANGED_SORTS];

/** The menu of the ways to create a character, which its buttons say they control. */
const CREATE_MENU_ID = "create-character-menu";

export default function CharactersPage() {
  usePageTitle("Characters");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Mounted as it opens: the create dialog keeps its form, its pickers and its roll method
  const createDialog = useDialogState();
  // Mounted as it opens too: the import's form starts clean; once it's in, its report opens on what it answered
  const importDialog = useDialogState();
  const reportDialog = useDialogState<CharacterImport>();
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ["name", "createdAt", "lastChangedAt"],
    CHARACTER_LIST_DEFAULTS,
  );

  const view = oneOf(searchParams.get("view"), CHARACTER_VIEWS, CHARACTER_LIST_DEFAULTS.view);

  const characters = useListPageQuery(characterListQuery({ view, search, orderBy, orderDir }));
  const portraitsByCharacterId = useCharacterPortraits(characters.items);

  const prefetchCharacter = (id: string) => void queryClient.prefetchQuery(characterDetailQuery(id));

  // A character is created two ways: built in the app, or imported from a file another program saved; the header's
  // button and the empty list's each open the menu, which says which one it's open from
  const headerMenu = useAnchorMenu();
  const emptyMenu = useAnchorMenu();
  const createMenu = headerMenu.open ? headerMenu : emptyMenu;
  const createButton = (label: string, menu: ReturnType<typeof useAnchorMenu>) => (
    <PageActionButton label={label} menu={{ id: CREATE_MENU_ID, open: menu.open }} onClick={menu.openMenu} />
  );

  const viewActiveButton = (
    <Button variant="outlined" onClick={() => updateSearchParams({ view: null })}>
      View Active Characters
    </Button>
  );

  return (
    <PageTransition>
      <Container>
        <Stack spacing={4}>
          <PageHeader
            variant="tinted"
            title="Characters"
            subtitle="View and manage your character collection"
            action={createButton("Create Character", headerMenu)}
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
                    action={createButton("Create Your First Character", emptyMenu)}
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
        <Menu id={CREATE_MENU_ID} anchorEl={createMenu.anchorEl} open={createMenu.open} onClose={createMenu.closeMenu}>
          <ActionMenuItem
            icon={PersonAddIcon}
            label="New Character"
            onClick={createMenu.closeMenuAnd(() => createDialog.openWith(true))}
          />
          <ActionMenuItem
            icon={ImportIcon}
            label="Import Character"
            onClick={createMenu.closeMenuAnd(() => importDialog.openWith(true))}
          />
        </Menu>
        {createDialog.target && (
          <CreateCharacterDialog
            key={createDialog.key}
            open={createDialog.open}
            onClose={createDialog.close}
            onExited={createDialog.onExited}
          />
        )}
        {importDialog.target && (
          <ImportCharacterDialog
            key={importDialog.key}
            open={importDialog.open}
            onClose={importDialog.close}
            onExited={importDialog.onExited}
            onImported={(imported) => reportDialog.openWith(imported)}
          />
        )}
        {reportDialog.target && (
          <ImportReportDialog
            key={reportDialog.key}
            imported={reportDialog.target}
            open={reportDialog.open}
            onClose={reportDialog.close}
            onExited={reportDialog.onExited}
          />
        )}
      </Container>
    </PageTransition>
  );
}
