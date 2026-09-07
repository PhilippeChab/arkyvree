import { PageTransition, DeleteDialog } from "@/client/src/components/common/index.ts";
import { DURATION } from "@/client/src/lib/animations.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError, rpc } from "@/client/src/services/rpc.ts";
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
import {
  Alert,
  Container,
  Fade,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDemoTimeRemaining, usePageTitle } from "@/client/src/hooks/index.ts";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AddLevelModal,
  CharacterModifiersModal,
  ContributorsDialog,
  EditLevelModal,
  ShareDialog,
} from "./components/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";
import {
  CharacterDetailSkeleton,
  CharacterSheetBody,
} from "@/client/src/components/characters/index.ts";
export default function CharacterDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isArchiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isHardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  const [isAddLevelOpen, setAddLevelOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<EditingLevel | null>(null);
  const [isRemovingLevel, setRemovingLevel] = useState(false);
  const [isArchiving, setArchiving] = useState(false);
  const [isHardDeleting, setHardDeleting] = useState(false);
  const [isShareOpen, setShareOpen] = useState(false);
  const [isContributorsOpen, setContributorsOpen] = useState(false);
  const [isModifiersOpen, setModifiersOpen] = useState(false);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { isDemo } = useDemoTimeRemaining();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const {
    data: character,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.characters.detail(id!),
    queryFn: async () => {
      if (!id) throw new Error("Character ID is required");
      const response = await rpc.api.characters[":id"]["$get"]({ param: { id } });
      if (!response.ok) throw new Error("Failed to fetch character");
      return response.json();
    },
    enabled: !!id,
  });

  usePageTitle(character?.identity?.physiology?.name);

  useEffect(() => {
    const characterIsBonded = character && "kind" in character && character.kind !== "pc";
    if (location.state?.openLevelUp && character && !characterIsBonded) {
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

  const handleRemoveLevel = async () => {
    if (!id) return;
    setRemovingLevel(true);
    try {
      await rpc.api.characters.levels[":characterId"]["$delete"]({
        param: { characterId: id },
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(id!) });
      setConfirmOpen(false);
    } catch (err) {
      snackbar.error(err, "Failed to remove level");
    } finally {
      setRemovingLevel(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!id) return;
    try {
      await rpc.api.characters[":characterId"]["pdf"]["$post"]({
        param: { characterId: id },
      });
      snackbar.info("Your PDF is being generated. You'll be notified when it's ready.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        snackbar.warning("Too many PDF requests. Please wait a minute before trying again.");
      } else {
        snackbar.error(error, "Failed to start PDF generation");
      }
    }
  };

  const handleArchiveCharacter = async () => {
    if (!id) return;
    setArchiving(true);
    try {
      await rpc.api.characters[":id"]["$delete"]({
        param: { id },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
      navigate("/characters");
    } catch (err) {
      snackbar.error(err, "Failed to archive character");
    } finally {
      setArchiving(false);
      setArchiveConfirmOpen(false);
    }
  };

  const handleUnarchiveCharacter = async () => {
    if (!id) return;
    try {
      await rpc.api.characters[":id"]["unarchive"].$post({
        param: { id },
      });
      snackbar.success("Character unarchived successfully");
      await queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(id!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
    } catch (err) {
      snackbar.error(err, "Failed to unarchive character");
    }
  };

  const handleHardDeleteCharacter = async () => {
    if (!id) return;
    setHardDeleting(true);
    try {
      // rpc.ts throws ApiError on non-OK responses.
      await rpc.api.characters[":id"]["permanent"].$delete({ param: { id } });
      snackbar.success("Character permanently deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
      navigate("/characters");
    } catch (err) {
      snackbar.error(err, "Failed to delete character");
    } finally {
      setHardDeleting(false);
      setHardDeleteConfirmOpen(false);
    }
  };

  if (isLoading) {
    return (
      <Fade in timeout={DURATION.slow}>
        <div><CharacterDetailSkeleton /></div>
      </Fade>
    );
  }

  if (error || !character || "error" in character) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">Failed to load character details.</Alert>
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
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1
            }}>
            <Stack
              direction="row"
              spacing={2}
              sx={{
                alignItems: "center",
                minWidth: 0
              }}>
              <IconButton onClick={() => navigate(isBonded && parentCharacterId ? `/characters/${parentCharacterId}` : "/characters")}>
                <ArrowBackIcon />
              </IconButton>
              <Typography sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
                {character.rulesetName || "Character Sheet"}
              </Typography>
            </Stack>

            {!(isBonded && isArchived) && (
              <Stack direction="row" spacing={1}>
              <IconButton onClick={handleClick} sx={{ color: "text.secondary" }}>
                <MoreVertIcon />
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                {isBonded ? (
                  <MenuItem
                    key="download-pdf"
                    onClick={() => {
                      handleDownloadPdf();
                      handleClose();
                    }}
                  >
                    <ListItemIcon>
                      <DownloadIcon fontSize="small" />
                    </ListItemIcon>
                    Download PDF
                  </MenuItem>
                ) : isArchived ? (
                  [
                    isOwner && (
                      <MenuItem
                        key="unarchive"
                        onClick={() => {
                          handleUnarchiveCharacter();
                          handleClose();
                        }}
                        sx={{ color: "success.main" }}
                      >
                        <ListItemIcon>
                          <UnarchiveIcon fontSize="small" sx={{ color: "success.main" }} />
                        </ListItemIcon>
                        Unarchive
                      </MenuItem>
                    ),
                    !isDemo && (
                      <MenuItem
                        key="contributors"
                        onClick={() => {
                          setContributorsOpen(true);
                          handleClose();
                        }}
                      >
                        <ListItemIcon>
                          <GroupIcon fontSize="small" />
                        </ListItemIcon>
                        Contributors
                      </MenuItem>
                    ),
                    isOwner && (
                      <MenuItem
                        key="hard-delete"
                        onClick={() => {
                          setHardDeleteConfirmOpen(true);
                          handleClose();
                        }}
                        sx={{ color: "error.main" }}
                      >
                        <ListItemIcon>
                          <DeleteForeverIcon fontSize="small" sx={{ color: "error.main" }} />
                        </ListItemIcon>
                        Delete permanently
                      </MenuItem>
                    ),
                  ]
                ) : (
                  [
                    <MenuItem
                      key="add-level"
                      onClick={() => {
                        setAddLevelOpen(true);
                        handleClose();
                      }}
                    >
                      <ListItemIcon>
                        <AddIcon fontSize="small" />
                      </ListItemIcon>
                      Add Level
                    </MenuItem>,
                    <MenuItem
                      key="remove-level"
                      onClick={() => {
                        setConfirmOpen(true);
                        handleClose();
                      }}
                    >
                      <ListItemIcon>
                        <RemoveIcon fontSize="small" />
                      </ListItemIcon>
                      Remove Level
                    </MenuItem>,
                    <MenuItem
                      key="manage-modifiers"
                      onClick={() => {
                        setModifiersOpen(true);
                        handleClose();
                      }}
                    >
                      <ListItemIcon>
                        <TuneIcon fontSize="small" />
                      </ListItemIcon>
                      Manage Modifiers
                    </MenuItem>,
                    <MenuItem
                      key="download-pdf"
                      onClick={() => {
                        handleDownloadPdf();
                        handleClose();
                      }}
                    >
                      <ListItemIcon>
                        <DownloadIcon fontSize="small" />
                      </ListItemIcon>
                      Download PDF
                    </MenuItem>,
                    !isDemo && (
                      <MenuItem
                        key="contributors"
                        onClick={() => {
                          setContributorsOpen(true);
                          handleClose();
                        }}
                      >
                        <ListItemIcon>
                          <GroupIcon fontSize="small" />
                        </ListItemIcon>
                        Contributors
                      </MenuItem>
                    ),
                    isOwner && !isDemo && (
                      <MenuItem
                        key="share"
                        onClick={() => {
                          setShareOpen(true);
                          handleClose();
                        }}
                      >
                        <ListItemIcon>
                          <ShareIcon fontSize="small" />
                        </ListItemIcon>
                        Share
                      </MenuItem>
                    ),
                    isOwner && (
                      <MenuItem
                        key="archive"
                        onClick={() => {
                          setArchiveConfirmOpen(true);
                          handleClose();
                        }}
                        sx={{ color: "warning.main" }}
                      >
                        <ListItemIcon>
                          <ArchiveIcon fontSize="small" sx={{ color: "warning.main" }} />
                        </ListItemIcon>
                        Archive
                      </MenuItem>
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
          onConfirm={handleRemoveLevel}
          title="Confirm Level Removal"
          message="Are you sure you want to remove the last level? This action cannot be undone."
          isLoading={isRemovingLevel}
        />

        <DeleteDialog
          open={isArchiveConfirmOpen}
          onClose={() => setArchiveConfirmOpen(false)}
          onConfirm={handleArchiveCharacter}
          title="Archive"
          message="Are you sure you want to archive this character? You can restore it later from the Archived view."
          isLoading={isArchiving}
        />

        <DeleteDialog
          open={isHardDeleteConfirmOpen}
          onClose={() => setHardDeleteConfirmOpen(false)}
          onConfirm={handleHardDeleteCharacter}
          title="Delete permanently"
          message="This will permanently delete this character and all of its levels, abilities, inventory, attachments, and customizations. This cannot be undone."
          isLoading={isHardDeleting}
          confirmLabel="Delete permanently"
        />


        <ShareDialog
          open={isShareOpen}
          onClose={() => setShareOpen(false)}
          characterId={id!}
          shareToken={character.shareToken}
        />

        <ContributorsDialog
          open={isContributorsOpen}
          onClose={() => setContributorsOpen(false)}
          characterId={id!}
          isOwner={isOwner}
          isArchived={isArchived}
        />

        <CharacterModifiersModal
          open={isModifiersOpen}
          onClose={() => setModifiersOpen(false)}
          characterId={id!}
          rulesetId={character.rulesetId}
        />

        {/* Read-Only Banner for Archived Characters */}
        {isArchived && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>This character is archived and read-only.</strong>{" "}
              You can view all content but cannot make changes.
            </Typography>
          </Alert>
        )}

        {isAddLevelOpen && (
          <AddLevelModal
            open
            onClose={() => setAddLevelOpen(false)}
            characterId={id!}
            baseRules={character.baseRules!}
          />
        )}
        {editingLevel && (
          <EditLevelModal
            open
            onClose={() => setEditingLevel(null)}
            characterId={id!}
            baseRules={character.baseRules!}
            editingLevel={editingLevel}
          />
        )}

        {isBonded ? (
          <CharacterSheetBody
            character={character}
            characterId={id!}
            readOnly
            identityReadOnly={isArchived}
            equipmentMode="readonly"
            rulesetId={character.rulesetId}
          />
        ) : (
          <CharacterSheetBody
            character={character}
            characterId={id!}
            readOnly={isArchived}
            onEditLevel={!isArchived ? setEditingLevel : undefined}
            onAddLevel={() => setAddLevelOpen(true)}
            onRemoveLevel={() => setConfirmOpen(true)}
            onViewBondedSheet={(bondedId) => navigate(`/characters/${bondedId}`)}
            equipmentMode="editable"
            rulesetId={character.rulesetId}
            showDiagnostics
          />
        )}
      </Container>
    </PageTransition>
  );
}
