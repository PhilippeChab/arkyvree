import { Alert, Container, Menu, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  CharacterDetailSkeleton,
  CharacterHeader,
  CharacterSheetBody,
} from "@/client/src/components/characters/index.ts";
import {
  ActionMenuItem,
  ConfirmDialog,
  DeleteDialog,
  PageError,
  PageTransition,
} from "@/client/src/components/common/index.ts";
import {
  AddIcon,
  ArchiveIcon,
  ContributorsIcon,
  DeleteIcon,
  DownloadIcon,
  ModifiersIcon,
  RemoveIcon,
  ShareIcon,
  UnarchiveIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, useDialogState, useIsDemo, usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { characterDetailQuery, invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
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
  const menu = useAnchorMenu();
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isArchiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isHardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  // A new character arrives with the Add Level wizard open (`openLevelUp`)
  const addLevel = useDialogState(location.state?.openLevelUp === true ? true : null);
  const editLevel = useDialogState<EditingLevel>();
  const [isShareOpen, setShareOpen] = useState(false);
  const [isContributorsOpen, setContributorsOpen] = useState(false);
  const [isModifiersOpen, setModifiersOpen] = useState(false);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const exportFn = () => parseResponse(rpc.api.characters[":characterId"].pdf.$post({ param: { characterId: id } }));
  const pdfExport = usePdfExport(exportFn);
  const isDemo = useIsDemo();
  const currentUserId = useAuthStore((s) => s.user?.id);

  // The route always gives an id
  const { data: character, isLoading, error } = useQuery(characterDetailQuery(id));

  usePageTitle(character?.identity?.physiology?.name);

  // Closing the wizard a new character arrived with clears that from its history entry: a reload or a Back doesn't
  // open it again
  const closeAddLevel = () => {
    addLevel.close();
    if (location.state?.openLevelUp) navigate(location.pathname, { replace: true, state: {} });
  };

  const removeLevelMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.characters.levels[":characterId"].$delete({ param: { characterId: id } })),
    onSuccess: async () => {
      void invalidateCharacterListings(queryClient);
      await invalidateCharacter(queryClient, id);
      setConfirmOpen(false);
    },
    onError: (error) => snackbar.error(error, "Failed to remove level"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.characters[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      void invalidateCharacter(queryClient, id);
      void invalidateCharacterListings(queryClient);
      navigate("/characters");
    },
    onError: (error) => snackbar.error(error, "Failed to archive character"),
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.characters[":id"].unarchive.$post({ param: { id } })),
    onSuccess: () => {
      snackbar.success("Character unarchived");
      return Promise.all([invalidateCharacter(queryClient, id), invalidateCharacterListings(queryClient)]);
    },
    onError: (error) => snackbar.error(error, "Failed to unarchive character"),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.characters[":id"].permanent.$delete({ param: { id } })),
    onSuccess: () => {
      snackbar.success("Character permanently deleted");
      void invalidateCharacterListings(queryClient);
      navigate("/characters");
      // Gone: don't let Back render it from the cache
      queryClient.removeQueries({ queryKey: QUERY_KEYS.characters.detail(id) });
    },
    onError: (error) => snackbar.error(error, "Failed to delete character"),
  });

  if (isLoading) return <CharacterDetailSkeleton />;

  // A failed background refetch keeps the loaded page (and any edits in progress) on screen.
  if (!character) {
    return (
      <Container maxWidth="xl">
        <PageError
          message={loadFailureMessage("Character", error)}
          backLabel="Back to Characters"
          backTo={"/characters"}
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
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <CharacterHeader
            name={character.identity?.physiology?.name ?? ""}
            rulesetName={character.rulesetName}
            backTo={isBonded && parentCharacterId ? `/characters/${parentCharacterId}` : "/characters"}
            onMenuOpen={isBonded && isArchived ? undefined : menu.openMenu}
            rename={isArchived ? undefined : { characterId: id, updatedAt: character.updatedAt, parentCharacterId }}
          />
          <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
            {isBonded ? (
              <ActionMenuItem
                key="download-pdf"
                icon={DownloadIcon}
                label="Download PDF"
                onClick={menu.closeMenuAnd(() => pdfExport.mutate())}
              />
            ) : isArchived ? (
              [
                isOwner && (
                  <ActionMenuItem
                    key="unarchive"
                    icon={UnarchiveIcon}
                    label="Unarchive"
                    intent="positive"
                    onClick={menu.closeMenuAnd(() => unarchiveMutation.mutate())}
                  />
                ),
                !isDemo && (
                  <ActionMenuItem
                    key="contributors"
                    icon={ContributorsIcon}
                    label="Contributors"
                    onClick={menu.closeMenuAnd(() => setContributorsOpen(true))}
                  />
                ),
                isOwner && (
                  <ActionMenuItem
                    key="hard-delete"
                    icon={DeleteIcon}
                    label="Delete Permanently"
                    intent="destructive"
                    onClick={menu.closeMenuAnd(() => setHardDeleteConfirmOpen(true))}
                  />
                ),
              ]
            ) : (
              [
                <ActionMenuItem
                  key="add-level"
                  icon={AddIcon}
                  label="Add Level"
                  onClick={menu.closeMenuAnd(() => addLevel.openWith(true))}
                />,
                <ActionMenuItem
                  key="remove-level"
                  icon={RemoveIcon}
                  label="Remove Level"
                  onClick={menu.closeMenuAnd(() => setConfirmOpen(true))}
                />,
                <ActionMenuItem
                  key="manage-modifiers"
                  icon={ModifiersIcon}
                  label="Manage Modifiers"
                  onClick={menu.closeMenuAnd(() => setModifiersOpen(true))}
                />,
                <ActionMenuItem
                  key="download-pdf"
                  icon={DownloadIcon}
                  label="Download PDF"
                  onClick={menu.closeMenuAnd(() => pdfExport.mutate())}
                />,
                !isDemo && (
                  <ActionMenuItem
                    key="contributors"
                    icon={ContributorsIcon}
                    label="Contributors"
                    onClick={menu.closeMenuAnd(() => setContributorsOpen(true))}
                  />
                ),
                isOwner && !isDemo && (
                  <ActionMenuItem
                    key="share"
                    icon={ShareIcon}
                    label="Share"
                    onClick={menu.closeMenuAnd(() => setShareOpen(true))}
                  />
                ),
                isOwner && (
                  <ActionMenuItem
                    key="archive"
                    icon={ArchiveIcon}
                    label="Archive"
                    intent="caution"
                    onClick={menu.closeMenuAnd(() => setArchiveConfirmOpen(true))}
                  />
                ),
              ]
            )}
          </Menu>

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
            title="Delete Permanently"
            message="Are you sure you want to permanently delete this character? Its levels, abilities, inventory, attachments and customizations go with it. This action cannot be undone."
            isLoading={hardDeleteMutation.isPending}
            confirmLabel="Delete Permanently"
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
            <Alert severity="info">
              <Typography variant="body2">
                <strong>This character is archived and read-only.</strong> You can view all content but cannot make
                changes.
              </Typography>
            </Alert>
          )}

          {addLevel.target && (
            <AddLevelModal
              open={addLevel.open}
              onClose={closeAddLevel}
              onExited={addLevel.onExited}
              characterId={id}
              baseRules={character.baseRules ?? DEFAULT_BASE_RULES}
            />
          )}
          {editLevel.target && (
            <EditLevelModal
              open={editLevel.open}
              onClose={editLevel.close}
              onExited={editLevel.onExited}
              characterId={id}
              baseRules={character.baseRules ?? DEFAULT_BASE_RULES}
              editingLevel={editLevel.target}
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
              showPrivateNotes
            />
          ) : (
            <CharacterSheetBody
              character={character}
              characterId={id}
              readOnly={isArchived}
              // Contributors edit the sheet, but only the owner changes a player character's portrait.
              portraitReadOnly={isArchived || !isOwner}
              onEditLevel={!isArchived ? editLevel.openWith : undefined}
              onAddLevel={() => addLevel.openWith(true)}
              onRemoveLevel={() => setConfirmOpen(true)}
              onViewBondedSheet={(bondedId) => navigate(`/characters/${bondedId}`)}
              equipmentMode="editable"
              rulesetId={character.rulesetId}
              diagnostics={character}
              showPrivateNotes
            />
          )}
        </Stack>
      </Container>
    </PageTransition>
  );
}
