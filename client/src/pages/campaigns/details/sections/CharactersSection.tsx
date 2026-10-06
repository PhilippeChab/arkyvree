import {
  Autocomplete,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { parseResponse } from "hono/client";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { characterTags } from "@/client/src/components/characters/index.ts";
import {
  BlankState,
  DiceSpinner,
  faqTooltip,
  ListCard,
  LoadError,
  LoadMoreButton,
  Modal,
  NoMatchesState,
  ScrollSafeListbox,
  SearchBar,
  SectionContent,
  TagChip,
} from "@/client/src/components/common/index.ts";
import { AddIcon, CharactersIcon, VisibilityIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  useAttachments,
  useDebouncedValue,
  useListboxQuery,
  usePrefetch,
  useSearchText,
  useStaggerOffset,
} from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import type { CampaignDetail } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { campaignCharactersQuery } from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type CampaignCharacter = CampaignCharactersPaginated["items"][number];
type CampaignCharactersPaginated = InferResponseType<(typeof rpc.api.campaigns)[":id"]["characters"]["$get"], 200>;
interface CharacterCardProps {
  character: CampaignCharacter;
  campaignId: string;
  isArchived: boolean;
  animationIndex: number;
  animationOffset: number;
  portraitUrl: string | null;
}

interface CharactersSectionProps {
  campaign: CampaignDetail;
}

interface LinkCharacterDialogProps {
  open: boolean;
  onClose: () => void;
  campaignId: string;
}

type UnlinkedCharacter = InferResponseType<
  (typeof rpc.api.characters.unlinked)[":campaignId"]["$get"],
  200
>["items"][number];

type Visibility = NonNullable<
  InferRequestType<(typeof rpc.api.campaigns)[":id"]["characters"]["$post"]>["json"]["visibility"]
>;

const VISIBILITY_DESCRIPTIONS: Record<Visibility, string> = {
  Private: "Only visible to you",
  Public: "Visible to all campaign members",
  Partial: "Limited information visible to others",
};

const VISIBILITY_OPTIONS = ["Private", "Public", "Partial"] as const satisfies readonly Visibility[];

function CharacterCard({
  character,
  campaignId,
  isArchived,
  animationIndex,
  animationOffset,
  portraitUrl,
}: CharacterCardProps) {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);

  const queryKey = useMemo(
    () => queryKeys.campaigns.characterDetail(campaignId, character.id),
    [campaignId, character.id],
  );
  const queryFn = useCallback(async () => {
    return parseResponse(
      rpc.api.campaigns[":id"].characters[":characterId"]["$get"]({
        param: { id: campaignId, characterId: character.id },
      }),
    );
  }, [campaignId, character.id]);
  const prefetchHandlers = usePrefetch(queryKey, queryFn);

  const { mutate: updateVisibility } = useMutation({
    mutationFn: async (visibility: Visibility) => {
      return parseResponse(
        rpc.api.campaigns[":id"].characters[":characterId"]["$put"]({
          param: { id: campaignId, characterId: character.id },
          json: { visibility },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Visibility updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.section(campaignId, "characters"),
      });
    },
    onError: (error) => {
      snackbar.error(error, "Failed to update visibility");
    },
  });

  const handleViewSheet = () => {
    navigate(`/campaigns/${campaignId}/characters/${character.id}`);
  };

  const canEditVisibility = character.isOwn && !isArchived;

  return (
    <ListCard
      onClick={handleViewSheet}
      animationIndex={animationIndex}
      animationOffset={animationOffset}
      {...prefetchHandlers}
      avatarSrc={portraitUrl ?? undefined}
      title={character.name}
      corner={
        <>
          <TagChip
            tag={{
              icon: VisibilityIcon,
              label: character.visibility,
              color: "default",
              onClick: canEditVisibility
                ? (event) => {
                    event.stopPropagation();
                    setMenuAnchorEl(event.currentTarget);
                  }
                : undefined,
            }}
          />
          {canEditVisibility && (
            <Menu
              anchorEl={menuAnchorEl}
              open={Boolean(menuAnchorEl)}
              onClose={(e: React.SyntheticEvent) => {
                e.stopPropagation?.();
                setMenuAnchorEl(null);
              }}
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <MenuItem
                  key={option}
                  selected={option === character.visibility}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuAnchorEl(null);
                    if (option !== character.visibility) {
                      updateVisibility(option);
                    }
                  }}
                >
                  {option}
                </MenuItem>
              ))}
            </Menu>
          )}
        </>
      }
      tags={characterTags({ race: character.race, levels: character.levels })}
      description={character.description}
    />
  );
}

function LinkCharacterDialog({ open, onClose, campaignId }: LinkCharacterDialogProps) {
  const queryClient = useQueryClient();
  const [selectedCharacter, setSelectedCharacter] = useState<UnlinkedCharacter | null>(null);
  const [characterSearch, setCharacterSearch] = useState("");
  const debouncedCharacterSearch = useDebouncedValue(characterSearch);
  const [visibility, setVisibility] = useState<Visibility>("Private");

  const {
    items: unlinkedCharacters,
    isLoading,
    onScroll: handleCharactersScroll,
  } = useListboxQuery({
    queryKey: queryKeys.characters.unlinked(campaignId, { search: debouncedCharacterSearch }),
    queryFn: async ({ pageParam }) => {
      return parseResponse(
        rpc.api.characters.unlinked[":campaignId"].$get({
          param: { campaignId },
          query: {
            limit: "10",
            page: pageParam.toString(),
            search: debouncedCharacterSearch || undefined,
          },
        }),
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: open,
  });

  const snackbar = useSnackbar();
  const { mutate: linkCharacter, isPending: isLinking } = useMutation({
    mutationFn: async ({ characterId, visibility }: { characterId: string; visibility: Visibility }) => {
      return parseResponse(
        rpc.api.campaigns[":id"].characters.$post({
          param: { id: campaignId },
          json: { characterId, visibility },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Character linked");
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.section(campaignId, "characters"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.unlinked(campaignId),
      });
      setSelectedCharacter(null);
      setCharacterSearch("");
      setVisibility("Private");
      onClose();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to link character");
    },
  });

  const handleLinkCharacter = () => {
    if (selectedCharacter) {
      linkCharacter({ characterId: selectedCharacter.id, visibility });
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <DialogTitle>Link Character to Campaign</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          <Autocomplete
            options={unlinkedCharacters}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            value={selectedCharacter}
            onChange={(_, newValue) => setSelectedCharacter(newValue)}
            onInputChange={(_, value, reason) => {
              if (reason === "input") setCharacterSearch(value);
            }}
            filterOptions={(x) => x}
            loading={isLoading}
            disabled={isLinking}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                {option.name}
              </li>
            )}
            renderInput={(params) => <TextField {...params} label="Character" />}
            fullWidth
            slotProps={{
              listbox: {
                component: ScrollSafeListbox,
                onScroll: handleCharactersScroll,
              },
            }}
          />

          <Stack>
            <TextField
              select
              fullWidth
              label="Visibility"
              value={visibility}
              onChange={(e) => setVisibility(oneOf(e.target.value, VISIBILITY_OPTIONS, visibility))}
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  <Box>
                    <Typography>{option}</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {VISIBILITY_DESCRIPTIONS[option]}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </TextField>
            <Tooltip
              describeChild
              title={faqTooltip("Controls how much of your character sheet other campaign members can see.")}
            >
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", mt: 0.5, cursor: "help", alignSelf: "flex-end" }}
              >
                What's this?
              </Typography>
            </Tooltip>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button onClick={handleLinkCharacter} variant="contained" disabled={!selectedCharacter || isLinking}>
          <DiceSpinner size="small" loading={isLinking}>
            Link Character
          </DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}

export function CharactersSection({ campaign }: CharactersSectionProps) {
  const [isLinkDialogOpen, setLinkDialogOpen] = useState(false);

  // Search state with debounce
  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("characterSearch");

  const listQuery = campaignCharactersQuery(campaign.id, searchQuery);

  const {
    data,
    isLoading: charactersLoading,
    error: charactersError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...listQuery, placeholderData: keepPreviousData });

  const characters = useMemo(() => pageItems(data), [data]);
  const offset = useStaggerOffset(characters);

  const characterIds = useMemo(() => characters.map((c) => c.id), [characters]);
  const { data: portraitsByCharacterId } = useAttachments({
    recordType: "Character",
    name: "portrait",
    recordIds: characterIds,
  });

  return (
    <SectionContent>
      {/* Header */}
      <Typography component="h2" sx={{ fontWeight: 600, mb: 3, typography: { xs: "h6", sm: "h5" } }}>
        Characters
      </Typography>

      <SearchBar
        {...searchTextProps}
        searchPlaceholder="Search characters..."
        actions={
          !campaign.deletedAt && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setLinkDialogOpen(true)}>
              Link Character
            </Button>
          )
        }
      />

      <LinkCharacterDialog open={isLinkDialogOpen} onClose={() => setLinkDialogOpen(false)} campaignId={campaign.id} />

      {/* Loading State */}
      {charactersLoading && <DiceSpinner sx={{ py: 4 }} />}

      {/* Error State */}
      {charactersError && <LoadError what="Characters" error={charactersError} sx={{ mb: 3 }} />}

      {/* Characters Grid */}
      {!charactersLoading && !charactersError && (
        <>
          {characters.length > 0 ? (
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
                {characters.map((character, index) => (
                  <CharacterCard
                    key={character.id}
                    character={character}
                    campaignId={campaign.id}
                    isArchived={!!campaign.deletedAt}
                    animationIndex={index}
                    animationOffset={offset}
                    portraitUrl={portraitsByCharacterId?.get(character.id) ?? null}
                  />
                ))}
              </Box>
              <LoadMoreButton
                size="large"
                label="Load More Characters"
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              />
            </>
          ) : searchQuery ? (
            <NoMatchesState search={searchQuery} />
          ) : (
            <BlankState
              icon={CharactersIcon}
              title="No characters in this campaign"
              description="Link your existing characters to this campaign to get started"
            />
          )}
        </>
      )}
    </SectionContent>
  );
}
