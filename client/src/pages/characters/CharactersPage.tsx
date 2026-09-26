import {
  BlankState,
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
import { useAttachments, useDebouncedValue, usePageTitle, useStaggerAnimation, useUpdateSearchParams } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { characterDetailQuery, characterListQuery, type CharacterListFilters } from "@/client/src/lib/queries.ts";
import { CreateCharacterDialog } from "@/client/src/pages/characters/components/index.ts";
import {
  Archive as ArchiveIcon,
  Group as GroupIcon,
  Shield as ShieldIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type CharacterView = CharacterListFilters["view"];
type SortField = CharacterListFilters["orderBy"];

const CHARACTER_FILTER_OPTIONS: FilterOption<CharacterView>[] = [
  { value: "active", label: "Active" },
  { value: "shared", label: "Shared" },
  { value: "archived", label: "Archived" },
];

const CHARACTER_SORT_OPTIONS: SortOption<SortField>[] = [
  { field: "name", direction: "asc", label: "Name (A-Z)" },
  { field: "name", direction: "desc", label: "Name (Z-A)" },
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
  { field: "updatedAt", direction: "desc", label: "Recently Updated" },
  { field: "updatedAt", direction: "asc", label: "Least Recently Updated" },
];

export default function CharactersPage() {
  usePageTitle("Characters");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const view = oneOf(searchParams.get("view"), ["active", "shared", "archived"], "active");
  const searchQuery = searchParams.get("search") || "";
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const orderBy = oneOf(searchParams.get("orderBy"), ["name", "createdAt", "updatedAt"], "createdAt");
  const orderDir = oneOf(searchParams.get("orderDir"), ["asc", "desc"], "desc");

  const listQuery = characterListQuery({ view, search: debouncedSearchQuery, orderBy, orderDir });
  const { offset, updateOffset } = useStaggerAnimation(listQuery.queryKey);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...listQuery, placeholderData: keepPreviousData });

  const characters = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data?.pages]);

  const characterIds = useMemo(() => characters.map((c) => c.id), [characters]);
  const { data: portraitsByCharacterId } = useAttachments({
    recordType: "Character",
    name: "portrait",
    recordIds: characterIds,
  });

  const prefetchCharacter = (id: string) => void queryClient.prefetchQuery(characterDetailQuery(id));

  const createButton = (label: string) => <PageActionButton onClick={() => setCreateModalOpen(true)}>{label}</PageActionButton>;

  const viewActiveButton = (
    <Button variant="outlined" onClick={() => updateSearchParams({ view: null })}>
      View Active Characters
    </Button>
  );

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageHeader
          variant="tinted"
          title="Characters"
          subtitle="View and manage your character collection"
          action={createButton("Create Character")}
        />

        <SearchBar
          searchValue={searchQuery}
          onSearchChange={(value) => updateSearchParams({ search: value }, { replace: true })}
          searchPlaceholder="Search characters..."
          filterOptions={CHARACTER_FILTER_OPTIONS}
          filterValue={view}
          onFilterChange={(value) => updateSearchParams({ view: value })}
          sortOptions={CHARACTER_SORT_OPTIONS}
          sortField={orderBy}
          sortDirection={orderDir}
          onSortChange={(field, direction) => updateSearchParams({ orderBy: field, orderDir: direction })}
        />

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: { xs: 4, sm: 8 } }}>
            <DiceSpinner />
          </Box>
        ) : error ? (
          <Alert severity="error">Failed to load characters.</Alert>
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
                  avatar={character.name.charAt(0).toUpperCase()}
                  avatarSrc={portraitsByCharacterId.get(character.id) ?? undefined}
                  title={character.name}
                  description={character.description}
                  pills={(
                    <>
                      {character.accessRole === "contributor" && (
                        <Chip label="Shared" size="small" color="info" variant="outlined" />
                      )}
                      <Chip
                        label={character.race}
                        size="small"
                        variant="outlined"
                        sx={{ borderColor: "secondary.main", color: "secondary.main", fontWeight: 500 }}
                      />
                      {character.levels.map((level) => (
                        <Chip
                          key={level.klass}
                          label={`${level.klass} ${level.level}`}
                          size="small"
                          sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 500 }}
                        />
                      ))}
                    </>
                  )}
                />
              ))}
            </ListCardGrid>
            <LoadMoreButton
              size="large"
              label="Load More Characters"
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onClick={() => {
                updateOffset(characters.length);
                fetchNextPage();
              }}
            />
          </>
        ) : view === "archived" ? (
          <BlankState
            icon={ArchiveIcon}
            title="No archived characters"
            description="Characters you archive will appear here. You can restore them at any time."
            action={viewActiveButton}
          />
        ) : view === "shared" ? (
          <BlankState
            icon={GroupIcon}
            title="No shared characters"
            description="Characters other users invite you to contribute to will appear here."
            action={viewActiveButton}
          />
        ) : (
          <BlankState
            icon={ShieldIcon}
            title="No characters yet"
            description="Create your first character to start your adventure"
            action={createButton("Create Your First Character")}
          />
        )}

        <CreateCharacterDialog
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
        />
      </Container>
    </PageTransition>
  );
}
