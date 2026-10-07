import {
  Autocomplete,
  Box,
  Chip,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { CharacterBuildChips } from "@/client/src/components/characters/index.ts";
import {
  AddButton,
  BlankState,
  DialogFooter,
  DiceSpinner,
  faqTooltip,
  ListCard,
  ListCardGrid,
  LoadError,
  LoadMoreButton,
  Modal,
  NoMatchesState,
  ScrollSafeListbox,
  SearchBar,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { CharacterIcon, VisibilityIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  useAnchorMenu,
  useCharacterPortraits,
  useDebouncedValue,
  useDialogState,
  useListboxQuery,
  useListPageQuery,
  useSearchText,
} from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { CampaignDetail } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { campaignCharacterQuery, unlinkedCharactersQuery } from "@/client/src/pages/campaigns/campaignQueries.ts";
import { campaignCharactersQuery } from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type CampaignCharacter = CampaignCharactersPaginated["items"][number];

type CampaignCharactersPaginated = InferResponseType<(typeof rpc.api.campaigns)[":id"]["characters"]["$get"], 200>;

interface CharacterCardProps {
  animationIndex: number;
  animationOffset: number;
  campaignId: string;
  character: CampaignCharacter;
  isArchived: boolean;
  portraitUrl: string | null;
}
interface CharactersSectionProps {
  campaign: CampaignDetail;
}
interface LinkCharacterDialogProps {
  campaignId: string;
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening starts clean. */
  onExited: () => void;
  open: boolean;
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
  const menu = useAnchorMenu();

  // Warm the sheet while the pointer is on the card.
  const prefetchSheet = () => void queryClient.prefetchQuery(campaignCharacterQuery(campaignId, character.id));

  const { mutate: updateVisibility } = useMutation({
    mutationFn: async (visibility: Visibility) => {
      return parseResponse(
        rpc.api.campaigns[":id"].characters[":characterId"].$put({
          param: { id: campaignId, characterId: character.id },
          json: { visibility },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Visibility updated");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.section(campaignId, "characters") });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.characterDetail(campaignId, character.id) });
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
      onMouseEnter={prefetchSheet}
      onFocus={prefetchSheet}
      avatarSrc={portraitUrl ?? undefined}
      title={character.name}
      description={character.description}
      action={
        <>
          <Chip
            label={
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <span>{character.visibility}</span>
                <VisibilityIcon sx={{ fontSize: 14 }} />
              </Stack>
            }
            size="small"
            variant="outlined"
            onClick={canEditVisibility ? menu.openMenu : undefined}
            sx={{ fontWeight: 500, fontSize: "0.7rem", cursor: canEditVisibility ? "pointer" : undefined }}
          />
          {canEditVisibility && (
            <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
              {VISIBILITY_OPTIONS.map((option) => (
                <MenuItem
                  key={option}
                  selected={option === character.visibility}
                  onClick={() => {
                    menu.closeMenu();
                    if (option !== character.visibility) updateVisibility(option);
                  }}
                >
                  {option}
                </MenuItem>
              ))}
            </Menu>
          )}
        </>
      }
      pills={<CharacterBuildChips race={character.race} levels={character.levels} />}
    />
  );
}

/** Picks one of the user's characters and its visibility; mounted while it's open, its pick and search its own. */
function LinkCharacterDialog({ open, onClose, onExited, campaignId }: LinkCharacterDialogProps) {
  const queryClient = useQueryClient();
  const [selectedCharacter, setSelectedCharacter] = useState<UnlinkedCharacter | null>(null);
  const [characterSearch, setCharacterSearch] = useState("");
  const debouncedCharacterSearch = useDebouncedValue(characterSearch);
  const [visibility, setVisibility] = useState<Visibility>("Private");

  const {
    items: unlinkedCharacters,
    isLoading,
    error: charactersError,
    onScroll: handleCharactersScroll,
  } = useListboxQuery({ ...unlinkedCharactersQuery(campaignId, debouncedCharacterSearch), enabled: open });

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
        queryKey: QUERY_KEYS.campaigns.section(campaignId, "characters"),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.characters.unlinked(campaignId),
      });
      onClose();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to link character");
    },
  });

  const handleLinkCharacter = () => {
    if (selectedCharacter) linkCharacter({ characterId: selectedCharacter.id, visibility });
  };

  return (
    <Modal open={open} onClose={onClose} slotProps={{ transition: { onExited } }}>
      <DialogTitle>Link Character to Campaign</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 2 }}>
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
            noOptionsText={emptyOptionsText("Characters", charactersError)}
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

          <Stack spacing={0.5}>
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
                    <Typography variant="body1">{option}</Typography>
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
              arrow
            >
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", cursor: "help", alignSelf: "flex-end", fontSize: "0.7rem" }}
              >
                What's this?
              </Typography>
            </Tooltip>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogFooter
        onCancel={onClose}
        pending={isLinking}
        action={{ label: "Link Character", onClick: handleLinkCharacter, disabled: !selectedCharacter }}
      />
    </Modal>
  );
}

export function CharactersSection({ campaign }: CharactersSectionProps) {
  const linkDialog = useDialogState();

  // Search state with debounce
  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("characterSearch");

  const characters = useListPageQuery(campaignCharactersQuery(campaign.id, searchQuery));
  const charactersLoadFailed = !!characters.error && characters.items.length === 0;
  const portraitsByCharacterId = useCharacterPortraits(characters.items);

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search characters…"
          actions={
            !campaign.deletedAt && <AddButton label="Link Character" onClick={() => linkDialog.openWith(true)} />
          }
        />

        {/* Loading State */}
        {characters.isLoading && <DiceSpinner sx={{ py: 4 }} />}

        {/* Error State: only while nothing has loaded, a failed refetch keeping the grid */}
        {charactersLoadFailed && (
          // The room below the error, at the end of the tab
          <Box sx={{ pb: 3 }}>
            <LoadError what="Characters" error={characters.error} />
          </Box>
        )}

        {/* Characters Grid */}
        {!characters.isLoading &&
          !charactersLoadFailed &&
          (characters.items.length > 0 ? (
            // With nothing more to load, the tab ends three units below the grid, as the grid's margin left it
            <Stack spacing={3} sx={{ pb: characters.hasNextPage ? 0 : 3 }}>
              <ListCardGrid>
                {characters.items.map((character, index) => (
                  <CharacterCard
                    key={character.id}
                    character={character}
                    campaignId={campaign.id}
                    isArchived={!!campaign.deletedAt}
                    animationIndex={index}
                    animationOffset={characters.offset}
                    portraitUrl={portraitsByCharacterId.get(character.id) ?? null}
                  />
                ))}
              </ListCardGrid>
              <LoadMoreButton
                size="large"
                label="Load More Characters"
                hasNextPage={characters.hasNextPage}
                isFetchingNextPage={characters.isFetchingNextPage}
                onClick={characters.loadMore}
              />
            </Stack>
          ) : searchQuery ? (
            <NoMatchesState search={searchQuery} />
          ) : (
            <BlankState
              icon={CharacterIcon}
              title="No characters in this campaign"
              description="Link your existing characters to this campaign to get started"
            />
          ))}
      </Stack>

      {linkDialog.target && (
        <LinkCharacterDialog
          open={linkDialog.open}
          onClose={linkDialog.close}
          onExited={linkDialog.onExited}
          campaignId={campaign.id}
        />
      )}
    </SectionContent>
  );
}
