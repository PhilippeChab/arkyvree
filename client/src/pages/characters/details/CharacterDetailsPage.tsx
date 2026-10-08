import { Container, Menu, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  CharacterDetailSkeleton,
  CharacterHeader,
  CharacterSheetBody,
  type EditingLevel,
} from "@/client/src/components/characters/index.ts";
import {
  ActionMenuItem,
  ArchivedNotice,
  ConfirmDialog,
  DeleteDialog,
  PageError,
  PageTransition,
} from "@/client/src/components/common/index.ts";
import { ContributorsDialog } from "@/client/src/components/contributors/index.ts";
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
import { useAnchorMenu, useDialogState, usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { characterDetailQuery, invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { characterPageState } from "@/client/src/pages/characters/characterPageState.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import { AddLevelModal, CharacterModifiersModal, EditLevelModal, ShareDialog } from "./components/index.ts";
import { useCharacterPermissions } from "./useCharacterPermissions.ts";

export default function CharacterDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id = "" } = useParams<{ id: string }>();
  const menu = useAnchorMenu();
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isArchiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isHardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  // A new character arrives with the Add Level wizard open (`openLevelUp`)
  const { openLevelUp } = characterPageState(location.state);
  const addLevel = useDialogState(openLevelUp ? true : null);
  const editLevel = useDialogState<EditingLevel>();
  const [isShareOpen, setShareOpen] = useState(false);
  const [isContributorsOpen, setContributorsOpen] = useState(false);
  const [isModifiersOpen, setModifiersOpen] = useState(false);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const exportFn = () => parseResponse(rpc.api.characters[":characterId"].pdf.$post({ param: { characterId: id } }));
  const pdfExport = usePdfExport(exportFn);

  // The route always gives an id
  const { data: character, isLoading, error } = useQuery(characterDetailQuery(id));
  const { isArchived, isOwner, canArchive, canEdit, canEditPortrait, canManageContributors, canShare } =
    useCharacterPermissions(character);

  usePageTitle(character?.identity?.physiology?.name);

  // Closing the wizard a new character arrived with clears that from its history entry: a reload or a Back doesn't
  // open it again
  const closeAddLevel = () => {
    addLevel.close();
    if (openLevelUp) navigate(location.pathname, { replace: true, state: {} });
  };

  const removeLevelMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.characters.levels[":characterId"].$delete({ param: { characterId: id } })),
    onSuccess: async () => {
      snackbar.success("Level removed");
      void invalidateCharacterListings(queryClient);
      await invalidateCharacter(queryClient, id);
      setConfirmOpen(false);
    },
    onError: (error) => snackbar.error(error, "Failed to remove level"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.characters[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      snackbar.success("Character archived");
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
            rename={canEdit ? { characterId: id, updatedAt: character.updatedAt, parentCharacterId } : undefined}
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
                canArchive && (
                  <ActionMenuItem
                    key="unarchive"
                    icon={UnarchiveIcon}
                    label="Unarchive"
                    intent="positive"
                    onClick={menu.closeMenuAnd(() => unarchiveMutation.mutate())}
                  />
                ),
                canManageContributors && (
                  <ActionMenuItem
                    key="contributors"
                    icon={ContributorsIcon}
                    label="Contributors"
                    onClick={menu.closeMenuAnd(() => setContributorsOpen(true))}
                  />
                ),
                canArchive && (
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
                canManageContributors && (
                  <ActionMenuItem
                    key="contributors"
                    icon={ContributorsIcon}
                    label="Contributors"
                    onClick={menu.closeMenuAnd(() => setContributorsOpen(true))}
                  />
                ),
                canShare && (
                  <ActionMenuItem
                    key="share"
                    icon={ShareIcon}
                    label="Share"
                    onClick={menu.closeMenuAnd(() => setShareOpen(true))}
                  />
                ),
                canArchive && (
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
            message="Are you sure you want to archive this character? You can unarchive it at any time from the Archived filter."
            isLoading={archiveMutation.isPending}
            confirmLabel="Archive Character"
            intent="caution"
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
            kind="character"
            id={id}
            open={isContributorsOpen}
            onClose={() => setContributorsOpen(false)}
            canInvite={isOwner && !isArchived}
            canLeave={!isOwner}
            canRemove={isOwner ? () => true : undefined}
          />

          <CharacterModifiersModal
            open={isModifiersOpen}
            onClose={() => setModifiersOpen(false)}
            characterId={id}
            rulesetId={character.rulesetId}
          />

          {isArchived && <ArchivedNotice what="character" canUnarchive={isOwner && !isBonded} />}

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
              identityReadOnly={!canEdit}
              equipmentMode="readonly"
              rulesetId={character.rulesetId}
              showPrivateNotes
            />
          ) : (
            <CharacterSheetBody
              character={character}
              characterId={id}
              readOnly={!canEdit}
              portraitReadOnly={!canEditPortrait}
              onEditLevel={canEdit ? editLevel.openWith : undefined}
              onAddLevel={() => addLevel.openWith(true)}
              onRemoveLevel={() => setConfirmOpen(true)}
              bondedLinkable
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
