import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  ArrowBack as ArrowBackIcon,
  DeleteForever as DeleteForeverIcon,
  Download as DownloadIcon,
  Group as GroupIcon,
  MoreVert as MoreVertIcon,
  Remove as RemoveIcon,
  Share as ShareIcon,
  Tune as TuneIcon,
  Unarchive as UnarchiveIcon,
} from "@mui/icons-material";
import { Alert, Container, Fade, IconButton, Menu, Paper, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { CharacterDetailSkeleton, CharacterSheetBody } from "@/client/src/components/characters/index.ts";
import {
  ActionMenuItem,
  ConfirmDialog,
  DeleteDialog,
  PageError,
  PageTransition,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useDemoTimeRemaining, usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { DURATION } from "@/client/src/lib/animations.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { characterDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import {
  AddLevelModal,
  CharacterModifiersModal,
  ContributorsDialog,
  EditLevelModal,
  ShareDialog,
} from "./components/index.ts";
export default function CharacterDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id = "" } = useParams<{ id: string }>();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isArchiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isHardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  const [isAddLevelOpen, setAddLevelOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<EditingLevel | null>(null);
  const [isShareOpen, setShareOpen] = useState(false);
  const [isContributorsOpen, setContributorsOpen] = useState(false);
  const [isModifiersOpen, setModifiersOpen] = useState(false);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const pdfExport = usePdfExport(() =>
    rpc.api.characters[":characterId"]["pdf"]["$post"]({ param: { characterId: id } }),
  );
  const { isDemo } = useDemoTimeRemaining();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const {
    data: character,
    isLoading,
    error,
  } = useQuery({
    ...characterDetailQuery(id),
    enabled: !!id,
  });

  usePageTitle(character?.identity?.physiology?.name);

  // A new character opens the Add Level wizard once: the character refetching (a rename, say) before the navigation
  // state clears mustn't open it again after it was closed.
  const openedLevelUp = useRef(false);
  useEffect(() => {
    const characterIsBonded = character && "kind" in character && character.kind !== "pc";
    if (location.state?.openLevelUp && character && !characterIsBonded && !openedLevelUp.current) {
      openedLevelUp.current = true;
      // oxlint-disable-next-line react/set-state-in-effect
      setAddLevelOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, character, navigate, location.pathname]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };
  const closeMenuAnd = (then: () => void) => () => {
    handleClose();
    then();
  };

  const invalidateCharacter = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists }),
    ]);

  const removeLevelMutation = useMutation({
    mutationFn: () => rpc.api.characters.levels[":characterId"].$delete({ param: { characterId: id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(id) });
      setConfirmOpen(false);
    },
    onError: (err) => snackbar.error(err, "Failed to remove level"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => rpc.api.characters[":id"].$delete({ param: { id } }),
    onSuccess: () => {
      void invalidateCharacter();
      navigate("/characters");
    },
    onError: (err) => {
      snackbar.error(err, "Failed to archive character");
      setArchiveConfirmOpen(false);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => rpc.api.characters[":id"].unarchive.$post({ param: { id } }),
    onSuccess: () => {
      snackbar.success("Character unarchived successfully");
      return invalidateCharacter();
    },
    onError: (err) => snackbar.error(err, "Failed to unarchive character"),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: () => rpc.api.characters[":id"].permanent.$delete({ param: { id } }),
    onSuccess: () => {
      snackbar.success("Character permanently deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
      navigate("/characters");
    },
    onError: (err) => {
      snackbar.error(err, "Failed to delete character");
      setHardDeleteConfirmOpen(false);
    },
  });

  if (isLoading) {
    return (
      <Fade in timeout={DURATION.slow}>
        <div>
          <CharacterDetailSkeleton />
        </div>
      </Fade>
    );
  }

  // A failed background refetch keeps the loaded page (and any edits in progress) on screen.
  if (!character) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageError
          message={loadFailureMessage("Character", error)}
          backLabel="Back to Characters"
          onBack={() => navigate("/characters")}
        />
      </Container>
    );
  }

  const isArchived = !!character.deletedAt;
  const isOwner = !!currentUserId && character.userId === currentUserId;
  const isBonded = "kind" in character && character.kind !== "pc";
  const parentCharacterId = "parentCharacterId" in character ? character.parentCharacterId : null;

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 2 }}>
        {/* Header with controls */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", minWidth: 0 }}>
              <IconButton
                aria-label="Back"
                onClick={() =>
                  navigate(isBonded && parentCharacterId ? `/characters/${parentCharacterId}` : "/characters")
                }
              >
                <ArrowBackIcon />
              </IconButton>
              <Typography sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
                {character.rulesetName || "Character Sheet"}
              </Typography>
            </Stack>

            {!(isBonded && isArchived) && (
              <Stack direction="row" spacing={1}>
                <IconButton aria-label="More actions" onClick={handleClick} sx={{ color: "text.secondary" }}>
                  <MoreVertIcon />
                </IconButton>
                <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                  {isBonded ? (
                    <ActionMenuItem
                      key="download-pdf"
                      icon={DownloadIcon}
                      label="Download PDF"
                      onClick={closeMenuAnd(() => pdfExport.mutate())}
                    />
                  ) : isArchived ? (
                    [
                      isOwner && (
                        <ActionMenuItem
                          key="unarchive"
                          icon={UnarchiveIcon}
                          label="Unarchive"
                          intent="positive"
                          onClick={closeMenuAnd(() => unarchiveMutation.mutate())}
                        />
                      ),
                      !isDemo && (
                        <ActionMenuItem
                          key="contributors"
                          icon={GroupIcon}
                          label="Contributors"
                          onClick={closeMenuAnd(() => setContributorsOpen(true))}
                        />
                      ),
                      isOwner && (
                        <ActionMenuItem
                          key="hard-delete"
                          icon={DeleteForeverIcon}
                          label="Delete permanently"
                          intent="destructive"
                          onClick={closeMenuAnd(() => setHardDeleteConfirmOpen(true))}
                        />
                      ),
                    ]
                  ) : (
                    [
                      <ActionMenuItem
                        key="add-level"
                        icon={AddIcon}
                        label="Add Level"
                        onClick={closeMenuAnd(() => setAddLevelOpen(true))}
                      />,
                      <ActionMenuItem
                        key="remove-level"
                        icon={RemoveIcon}
                        label="Remove Level"
                        onClick={closeMenuAnd(() => setConfirmOpen(true))}
                      />,
                      <ActionMenuItem
                        key="manage-modifiers"
                        icon={TuneIcon}
                        label="Manage Modifiers"
                        onClick={closeMenuAnd(() => setModifiersOpen(true))}
                      />,
                      <ActionMenuItem
                        key="download-pdf"
                        icon={DownloadIcon}
                        label="Download PDF"
                        onClick={closeMenuAnd(() => pdfExport.mutate())}
                      />,
                      !isDemo && (
                        <ActionMenuItem
                          key="contributors"
                          icon={GroupIcon}
                          label="Contributors"
                          onClick={closeMenuAnd(() => setContributorsOpen(true))}
                        />
                      ),
                      isOwner && !isDemo && (
                        <ActionMenuItem
                          key="share"
                          icon={ShareIcon}
                          label="Share"
                          onClick={closeMenuAnd(() => setShareOpen(true))}
                        />
                      ),
                      isOwner && (
                        <ActionMenuItem
                          key="archive"
                          icon={ArchiveIcon}
                          label="Archive"
                          intent="caution"
                          onClick={closeMenuAnd(() => setArchiveConfirmOpen(true))}
                        />
                      ),
                    ]
                  )}
                </Menu>
              </Stack>
            )}
          </Stack>
        </Paper>

        <DeleteDialog
          open={isConfirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => removeLevelMutation.mutate()}
          title="Remove Level"
          message="Are you sure you want to remove the last level? This action cannot be undone."
          isLoading={removeLevelMutation.isPending}
          confirmLabel="Remove Level"
        />

        <ConfirmDialog
          open={isArchiveConfirmOpen}
          onClose={() => setArchiveConfirmOpen(false)}
          onConfirm={() => archiveMutation.mutate()}
          title="Archive Character"
          message="Are you sure you want to archive this character? You can restore it later from the Archived view."
          isLoading={archiveMutation.isPending}
          confirmLabel="Archive Character"
          confirmColor="warning"
          confirmIcon={<ArchiveIcon />}
        />

        <DeleteDialog
          open={isHardDeleteConfirmOpen}
          onClose={() => setHardDeleteConfirmOpen(false)}
          onConfirm={() => hardDeleteMutation.mutate()}
          title="Delete permanently"
          message="This will permanently delete this character and all of its levels, abilities, inventory, attachments, and customizations. This cannot be undone."
          isLoading={hardDeleteMutation.isPending}
          confirmLabel="Delete permanently"
        />

        <ShareDialog
          open={isShareOpen}
          onClose={() => setShareOpen(false)}
          characterId={id}
          shareToken={character.shareToken}
        />

        <ContributorsDialog
          open={isContributorsOpen}
          onClose={() => setContributorsOpen(false)}
          characterId={id}
          isOwner={isOwner}
          isArchived={isArchived}
        />

        <CharacterModifiersModal
          open={isModifiersOpen}
          onClose={() => setModifiersOpen(false)}
          characterId={id}
          rulesetId={character.rulesetId}
        />

        {/* Read-Only Banner for Archived Characters */}
        {isArchived && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>This character is archived and read-only.</strong> You can view all content but cannot make
              changes.
            </Typography>
          </Alert>
        )}

        {isAddLevelOpen && (
          <AddLevelModal
            open
            onClose={() => setAddLevelOpen(false)}
            characterId={id}
            baseRules={character.baseRules ?? DEFAULT_BASE_RULES}
          />
        )}
        {editingLevel && (
          <EditLevelModal
            open
            onClose={() => setEditingLevel(null)}
            characterId={id}
            baseRules={character.baseRules ?? DEFAULT_BASE_RULES}
            editingLevel={editingLevel}
          />
        )}

        {isBonded ? (
          <CharacterSheetBody
            character={character}
            characterId={id}
            readOnly
            identityReadOnly={isArchived}
            equipmentMode="readonly"
            rulesetId={character.rulesetId}
          />
        ) : (
          <CharacterSheetBody
            character={character}
            characterId={id}
            readOnly={isArchived}
            // Contributors edit the sheet, but only the owner changes a player character's portrait.
            portraitReadOnly={isArchived || !isOwner}
            onEditLevel={!isArchived ? setEditingLevel : undefined}
            onAddLevel={() => setAddLevelOpen(true)}
            onRemoveLevel={() => setConfirmOpen(true)}
            onViewBondedSheet={(bondedId) => navigate(`/characters/${bondedId}`)}
            equipmentMode="editable"
            rulesetId={character.rulesetId}
            diagnostics={character}
          />
        )}
      </Container>
    </PageTransition>
  );
}
