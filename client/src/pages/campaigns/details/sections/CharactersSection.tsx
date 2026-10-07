import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
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
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";
import { type SyntheticEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  BlankState,
  DiceSpinner,
  faqTooltip,
  LoadError,
  LoadMoreButton,
  Modal,
  NoMatchesState,
  ScrollSafeListbox,
  SearchBar,
  SectionContent,
  StyledCard,
} from "@/client/src/components/common/index.ts";
import { AddIcon, CharacterIcon, VisibilityIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  useAttachments,
  useDebouncedValue,
  useListboxQuery,
  useSearchText,
  useStaggerAnimation,
} from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import type { CampaignDetail } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { campaignCharacterQuery, unlinkedCharactersQuery } from "@/client/src/pages/campaigns/campaignQueries.ts";
import { campaignCharactersQuery } from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { lineClampSx } from "@/client/src/theme/text.ts";
import { getInitial } from "@/shared/text.ts";

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

  // Warm the sheet while the pointer is on the card.
  const prefetchSheet = () => void queryClient.prefetchQuery(campaignCharacterQuery(campaignId, character.id));

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
        queryKey: QUERY_KEYS.campaigns.section(campaignId, "characters"),
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
    <StyledCard
      onClick={handleViewSheet}
      animationIndex={animationIndex}
      animationOffset={animationOffset}
      onMouseEnter={prefetchSheet}
      onFocus={prefetchSheet}
    >
      {/* The card's body: its head (title, pills) above its description, which fills what the card has left */}
      <Stack spacing={{ xs: 3.5, sm: 4 }} sx={{ p: { xs: 2, sm: 3 }, flex: 1 }}>
        <Stack spacing={1}>
          {/* Title Row */}
          <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0, flex: 1 }}>
              <Avatar
                src={portraitUrl ?? undefined}
                sx={{
                  width: 36,
                  height: 36,
                  border: 2,
                  borderColor: "secondary.main",
                  background: (theme) =>
                    `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
                  fontSize: "1rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {getInitial(character.name)}
              </Avatar>
              <Typography
                variant="h6"
                component="h6"
                noWrap
                sx={{
                  fontWeight: 600,
                  color: "text.primary",
                  lineHeight: 1.2,
                  textAlign: "left",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {character.name}
              </Typography>
            </Stack>
            <Chip
              label={
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{
                    alignItems: "center",
                  }}
                >
                  <span>{character.visibility}</span>
                  <VisibilityIcon sx={{ fontSize: 14 }} />
                </Stack>
              }
              size="small"
              variant="outlined"
              onClick={
                canEditVisibility
                  ? (e) => {
                      e.stopPropagation();
                      setMenuAnchorEl(e.currentTarget);
                    }
                  : undefined
              }
              sx={{ fontWeight: 500, fontSize: "0.7rem", cursor: canEditVisibility ? "pointer" : undefined }}
            />
            {canEditVisibility && (
              <Menu
                anchorEl={menuAnchorEl}
                open={Boolean(menuAnchorEl)}
                onClose={(e: SyntheticEvent) => {
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
                      if (option !== character.visibility) updateVisibility(option);
                    }}
                  >
                    {option}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </Stack>

          {/* Race and Class Level Pills */}
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "flex-start", flexWrap: "wrap", columnGap: 2, rowGap: 1 }}
          >
            <Chip
              label={character.race}
              size="small"
              variant="outlined"
              sx={{ borderColor: "secondary.main", color: "secondary.main", fontWeight: 500 }}
            />
            {character.levels.map((level, index) => (
              <Chip
                key={index}
                label={`${level.klass} ${level.level}`}
                size="small"
                sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 500 }}
              />
            ))}
          </Stack>
        </Stack>
        <Typography
          variant="body2"
          sx={{
            ...lineClampSx(4),
            color: "text.secondary",
            lineHeight: 1.6,
            minHeight: "6.4em",
          }}
        >
          {character.description || "No description available"}
        </Typography>
      </Stack>
    </StyledCard>
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
      snackbar.success("Character linked successfully");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.campaigns.section(campaignId, "characters"),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.characters.unlinked(campaignId),
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
    if (selectedCharacter) linkCharacter({ characterId: selectedCharacter.id, visibility });
  };

  return (
    <Modal open={open} onClose={onClose}>
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
  const { offset, updateOffset } = useStaggerAnimation(listQuery.queryKey);

  const {
    data,
    isLoading: charactersLoading,
    error: charactersError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...listQuery, placeholderData: keepPreviousData });

  const characters = useMemo(() => pageItems(data), [data]);

  const characterIds = useMemo(() => characters.map((c) => c.id), [characters]);
  const { data: portraitsByCharacterId } = useAttachments({
    recordType: "Character",
    name: "portrait",
    recordIds: characterIds,
  });

  return (
    <SectionContent>
      <Stack spacing={3}>
        <Typography component="h2" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
          Characters
        </Typography>

        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search characters..."
          actions={
            !campaign.deletedAt && (
              <Button variant="contained" startIcon={<AddIcon />} size="medium" onClick={() => setLinkDialogOpen(true)}>
                Link Character
              </Button>
            )
          }
        />

        {/* Loading State */}
        {charactersLoading && <DiceSpinner sx={{ py: 4 }} />}

        {/* Error State */}
        {charactersError && (
          // The room below the error, at the end of the tab
          <Box sx={{ pb: 3 }}>
            <LoadError what="Characters" error={charactersError} />
          </Box>
        )}

        {/* Characters Grid */}
        {!charactersLoading &&
          !charactersError &&
          (characters.length > 0 ? (
            // With nothing more to load, the tab ends three units below the grid, as the grid's margin left it
            <Stack spacing={3} sx={{ pb: hasNextPage ? 0 : 3 }}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, 1fr)",
                    lg: "repeat(3, 1fr)",
                  },
                  gap: 3,
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
                onClick={() => {
                  updateOffset(characters.length);
                  fetchNextPage();
                }}
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

      <LinkCharacterDialog open={isLinkDialogOpen} onClose={() => setLinkDialogOpen(false)} campaignId={campaign.id} />
    </SectionContent>
  );
}
