import { Autocomplete, Box, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { CharacterBuildChips, PARTIAL_IDENTITY_NOTE } from "@/client/src/components/characters/index.ts";
import {
  AddButton,
  BlankState,
  DialogFooter,
  HelpLabel,
  ListCard,
  ListCardGrid,
  ListPageResults,
  Modal,
  ScrollSafeListbox,
  SearchBar,
  SectionContent,
  StatusChip,
} from "@/client/src/components/common/index.ts";
import { CharacterIcon, VisibilityIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  useCharacterPortraits,
  useDebouncedValue,
  useDialogState,
  useListboxQuery,
  useListPageQuery,
  useSearchText,
} from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { campaignCharacterQuery, type CampaignDetail } from "@/client/src/pages/campaigns/campaignQueries.ts";
import {
  campaignCharactersQuery,
  unlinkedCharactersQuery,
} from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { CHARACTER_VISIBILITY_OPTIONS, type CharacterVisibility } from "@/shared/campaigns.ts";

interface CharacterCardProps {
  animationIndex: number;
  animationOffset: number;
  /** Its campaign is archived: its visibility is set. */
  campaignArchived: boolean;
  campaignId: string;
  character: CampaignCharacter;
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
type CampaignCharacter = CampaignCharactersPaginated["items"][number];
type CampaignCharactersPaginated = InferResponseType<(typeof rpc.api.campaigns)[":id"]["characters"]["$get"], 200>;

type UnlinkedCharacter = InferResponseType<
  (typeof rpc.api.characters.unlinked)[":campaignId"]["$get"],
  200
>["items"][number];

const VISIBILITY_DESCRIPTIONS: Record<CharacterVisibility, string> = {
  Private: "Hidden from the other players: the Game Masters alone see it",
  Public: "Visible to all campaign members",
  Partial: "The other players see its physical traits only",
};

function CharacterCard({
  character,
  campaignId,
  campaignArchived,
  animationIndex,
  animationOffset,
  portraitUrl,
}: CharacterCardProps) {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  // Warm the sheet while the pointer is on the card.
  const prefetchSheet = () => void queryClient.prefetchQuery(campaignCharacterQuery(campaignId, character.id));

  const visibilityMutation = useMutation({
    mutationFn: async (visibility: CharacterVisibility) =>
      parseResponse(
        rpc.api.campaigns[":id"].characters[":characterId"].$put({
          param: { id: campaignId, characterId: character.id },
          json: { visibility },
        }),
      ),
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

  const canEditVisibility = character.isOwn && !campaignArchived;

  return (
    <ListCard
      onClick={handleViewSheet}
      animationIndex={animationIndex}
      animationOffset={animationOffset}
      onMouseEnter={prefetchSheet}
      onFocus={prefetchSheet}
      avatarSrc={portraitUrl ?? undefined}
      title={character.name}
      // A Partial character's description is hidden, not missing
      description={character.isPartial ? PARTIAL_IDENTITY_NOTE : character.description}
      action={
        // Its owner picks it in a select, a chip being a value and never an action; the others read it
        canEditVisibility ? (
          <TextField
            select
            size="small"
            label="Visibility"
            value={character.visibility}
            onChange={(event) =>
              visibilityMutation.mutate(oneOf(event.target.value, CHARACTER_VISIBILITY_OPTIONS, "Private"))
            }
            disabled={visibilityMutation.isPending}
            sx={{ minWidth: 120 }}
          >
            {CHARACTER_VISIBILITY_OPTIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <StatusChip icon={<VisibilityIcon />} label={character.visibility} />
        )
      }
      chips={<CharacterBuildChips race={character.race} levels={character.levels} />}
    />
  );
}

/** Picks one of the user's characters and its visibility; mounted while it's open, its pick and search its own. */
function LinkCharacterDialog({ open, onClose, onExited, campaignId }: LinkCharacterDialogProps) {
  const queryClient = useQueryClient();
  const [selectedCharacter, setSelectedCharacter] = useState<UnlinkedCharacter | null>(null);
  const [characterSearch, setCharacterSearch] = useState("");
  const debouncedCharacterSearch = useDebouncedValue(characterSearch);
  const [visibility, setVisibility] = useState<CharacterVisibility>("Private");

  const {
    items: unlinkedCharacters,
    isLoading,
    error: charactersError,
    onScroll: handleCharactersScroll,
  } = useListboxQuery({ ...unlinkedCharactersQuery(campaignId, debouncedCharacterSearch), enabled: open });

  const snackbar = useSnackbar();
  const linkMutation = useMutation({
    mutationFn: async ({ characterId, visibility }: { characterId: string; visibility: CharacterVisibility }) =>
      parseResponse(
        rpc.api.campaigns[":id"].characters.$post({
          param: { id: campaignId },
          json: { characterId, visibility },
        }),
      ),
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
    if (selectedCharacter) linkMutation.mutate({ characterId: selectedCharacter.id, visibility });
  };

  return (
    <Modal open={open} onClose={onClose} slotProps={{ transition: { onExited } }}>
      <DialogTitle>Link Character to Campaign</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
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
            disabled={linkMutation.isPending}
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
              label={
                <HelpLabel
                  label="Visibility"
                  help="Controls how much of your character sheet other campaign members can see."
                />
              }
              value={visibility}
              onChange={(e) => setVisibility(oneOf(e.target.value, CHARACTER_VISIBILITY_OPTIONS, visibility))}
            >
              {CHARACTER_VISIBILITY_OPTIONS.map((option) => (
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
          </Stack>
        </Stack>
      </DialogContent>
      <DialogFooter
        onCancel={onClose}
        pending={linkMutation.isPending}
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

        <ListPageResults
          variant="section"
          list={characters}
          search={searchQuery}
          what="Characters"
          empty={
            <BlankState
              icon={CharacterIcon}
              title="No characters in this campaign"
              description="Link your existing characters to this campaign to get started"
            />
          }
        >
          <ListCardGrid>
            {characters.items.map((character, index) => (
              <CharacterCard
                key={character.id}
                character={character}
                campaignId={campaign.id}
                campaignArchived={!!campaign.deletedAt}
                animationIndex={index}
                animationOffset={characters.offset}
                portraitUrl={portraitsByCharacterId.get(character.id) ?? null}
              />
            ))}
          </ListCardGrid>
        </ListPageResults>
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
