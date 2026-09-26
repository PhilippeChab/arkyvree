import {
  BlankState,
  faqTooltip,
  Modal,
  SearchBar,
  StyledCard,
  DiceSpinner,
  LoadMoreButton,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useAttachments, useDebouncedValue, usePrefetch, useStaggerAnimation } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  Person as CharacterIcon,
  Visibility as VisibilityIcon,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { campaignCharactersQuery } from "@/client/src/pages/campaigns/details/sectionQueries.ts";

type CampaignCharactersResponse = InferResponseType<
  (typeof rpc.api.campaigns)[":id"]["characters"]["$get"]
>;
type CampaignCharactersPaginated = Exclude<
  CampaignCharactersResponse,
  { error: string }
>;
type CampaignCharacter = CampaignCharactersPaginated["items"][number];

interface CharactersSectionProps {
  campaign: {
    id: string;
    name: string;
    deletedAt: string | null;
  };
}

const VISIBILITY_OPTIONS = ["Private", "Public", "Partial"] as const;

function CharacterCard({
  character,
  campaignId,
  isArchived,
  animationIndex,
  animationOffset,
  portraitUrl,
}: {
  character: CampaignCharacter;
  campaignId: string;
  isArchived: boolean;
  animationIndex: number;
  animationOffset: number;
  portraitUrl: string | null;
}) {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);

  const queryKey = useMemo(
    () => queryKeys.campaigns.characterDetail(campaignId, character.id),
    [campaignId, character.id],
  );
  const queryFn = useCallback(async () => {
    return parseResponse(rpc.api.campaigns[":id"].characters[":characterId"]["$get"]({
      param: { id: campaignId, characterId: character.id },
    }));
  }, [campaignId, character.id]);
  const prefetchHandlers = usePrefetch(queryKey, queryFn);

  const { mutate: updateVisibility } = useMutation({
    mutationFn: async (visibility: "Private" | "Public" | "Partial") => {
      return parseResponse(rpc.api.campaigns[":id"].characters[":characterId"]["$put"]({
        param: { id: campaignId, characterId: character.id },
        json: { visibility },
      }));
    },
    onSuccess: () => {
      snackbar.success("Visibility updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.section(campaignId, "characters"),
      });
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const handleViewSheet = () => {
    navigate(`/campaigns/${campaignId}/characters/${character.id}`);
  };

  const canEditVisibility = character.isOwn && !isArchived;

  return (
    <StyledCard onClick={handleViewSheet} animationIndex={animationIndex} animationOffset={animationOffset} {...prefetchHandlers}>
      <Box sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 1.5, sm: 2 } }}>
        {/* Title Row */}
        <Stack
          direction="row"
          spacing={2}
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1
          }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0, flex: 1 }}>
            <Avatar
              src={portraitUrl ?? undefined}
              sx={{
                width: 36,
                height: 36,
                border: "2px solid",
                borderColor: "secondary.main",
                background: (theme) =>
                  `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
                fontSize: "1rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {character.name.charAt(0).toUpperCase()}
            </Avatar>
            <Typography
              variant="h6"
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
            label={<Stack direction="row" spacing={0.5} sx={{
              alignItems: "center"
            }}><span>{character.visibility}</span><VisibilityIcon sx={{ fontSize: 14 }} /></Stack>}
            size="small"
            variant="outlined"
            onClick={canEditVisibility ? (e) => {
              e.stopPropagation();
              setMenuAnchorEl(e.currentTarget);
            } : undefined}
            sx={{
              fontWeight: 500,
              fontSize: "0.7rem",
              ...(canEditVisibility && { cursor: "pointer" }),
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
        </Stack>

        {/* Race and Class Level Pills */}
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            justifyContent: "flex-start",
            flexWrap: "wrap",
            gap: 1,
            mb: 2
          }}>
          <Chip
            label={character.race}
            size="small"
            variant="outlined"
            sx={{
              borderColor: "secondary.main",
              color: "secondary.main",
              fontWeight: 500,
            }}
          />
          {character.levels.map((level, index) => (
            <Chip
              key={index}
              label={`${level.klass} ${level.level}`}
              size="small"
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontWeight: 500,
              }}
            />
          ))}
        </Stack>
      </Box>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            lineHeight: 1.6,
            minHeight: "6.4em",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }}>
          {character.description || "No description available"}
        </Typography>
      </Box>
    </StyledCard>
  );
}

function LinkCharacterDialog({
  open,
  onClose,
  campaignId,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
}) {
  const queryClient = useQueryClient();
  const [selectedCharacter, setSelectedCharacter] = useState<{ id: string; name: string } | null>(null);
  const [characterSearch, setCharacterSearch] = useState("");
  const debouncedCharacterSearch = useDebouncedValue(characterSearch);
  const [visibility, setVisibility] = useState<
    "Private" | "Public" | "Partial"
  >("Private");

  const {
    data: unlinkedCharactersData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.characters.unlinked(campaignId, { search: debouncedCharacterSearch }),
    queryFn: async ({ pageParam }) => {
      return parseResponse(rpc.api.characters.unlinked[":campaignId"].$get({
        param: { campaignId },
        query: {
          limit: "10",
          page: pageParam.toString(),
          ...(debouncedCharacterSearch && { search: debouncedCharacterSearch }),
        },
      }));
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: open,
  });

  const unlinkedCharacters =
    unlinkedCharactersData?.pages.flatMap((page) => page.items) ?? [];

  const handleCharactersScroll = createListboxScrollHandler({ hasNextPage, isFetchingNextPage, fetchNextPage });

  const snackbar = useSnackbar();
  const { mutate: linkCharacter, isPending: isLinking } = useMutation({
    mutationFn: async ({
      characterId,
      visibility,
    }: {
      characterId: string;
      visibility: "Private" | "Public" | "Partial";
    }) => {
      return parseResponse(rpc.api.campaigns[":id"].characters.$post({
        param: { id: campaignId },
        json: { characterId, visibility },
      }));
    },
    onSuccess: () => {
      snackbar.success("Character linked successfully");
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
      snackbar.error(error);
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
        <Stack spacing={3} sx={{ mt: 2 }}>
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
            renderInput={(params) => (
              <TextField
                {...params}
                label="Character"
              />
            )}
            fullWidth
            slotProps={{
              listbox: {
                onScroll: handleCharactersScroll,
                style: { maxHeight: 300 },
              }
            }}
          />

          <FormControl fullWidth>
            <InputLabel>Visibility</InputLabel>
            <Select
              label="Visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(
                  e.target.value as "Private" | "Public" | "Partial",
                )
              }
            >
              <MenuItem value="Private">
                <Box>
                  <Typography variant="body1">Private</Typography>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    Only visible to you
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="Public">
                <Box>
                  <Typography variant="body1">Public</Typography>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    Visible to all campaign members
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="Partial">
                <Box>
                  <Typography variant="body1">Partial</Typography>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    Limited information visible to others
                  </Typography>
                </Box>
              </MenuItem>
            </Select>
            <Tooltip title={faqTooltip("Controls how much of your character sheet other campaign members can see.")} arrow>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  mt: 0.5,
                  cursor: "help",
                  alignSelf: "flex-end",
                  fontSize: "0.7rem"
                }}>
                What's this?
              </Typography>
            </Tooltip>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="inherit">Cancel</Button>
        <Button
          onClick={handleLinkCharacter}
          variant="contained"
          disabled={!selectedCharacter || isLinking}
        >
          <DiceSpinner size="small" loading={isLinking}>Link Character</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}

export function CharactersSection({ campaign }: CharactersSectionProps) {
  const [isLinkDialogOpen, setLinkDialogOpen] = useState(false);

  // Search state with debounce
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery);

  const listQuery = campaignCharactersQuery(campaign.id, debouncedSearchQuery);
  const { offset, updateOffset } = useStaggerAnimation(listQuery.queryKey);

  const {
    data,
    isLoading: charactersLoading,
    error: charactersError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...listQuery, placeholderData: keepPreviousData });

  const characters = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data?.pages],
  );

  const characterIds = useMemo(() => characters.map((c) => c.id), [characters]);
  const { data: portraitsByCharacterId } = useAttachments({
    recordType: "Character",
    name: "portrait",
    recordIds: characterIds,
  });

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <Typography sx={{ fontWeight: 600, mb: 3, typography: { xs: "h6", sm: "h5" } }}>
        Characters
      </Typography>

      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search characters..."
        actions={!campaign.deletedAt && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="medium"
            onClick={() => setLinkDialogOpen(true)}
          >
            Link Character
          </Button>
        )}
      />

      <LinkCharacterDialog
        open={isLinkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        campaignId={campaign.id}
      />

      {/* Loading State */}
      {charactersLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <DiceSpinner />
        </Box>
      )}

      {/* Error State */}
      {charactersError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load characters
        </Alert>
      )}

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
                onClick={() => {
                  updateOffset(characters.length);
                  fetchNextPage();
                }}
              />
            </>
          ) : (
            <BlankState
              icon={CharacterIcon}
              title="No characters in this campaign"
              description="Link your existing characters to this campaign to get started"
            />
          )}
        </>
      )}
    </Box>
  );
}
