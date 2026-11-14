import { Container, Menu, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  CharacterDetailSkeleton,
  CharacterHeader,
  CharacterSheetBody,
  type EditingAdvancement,
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
  ShareIcon,
  UnarchiveIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, useDialogState, usePageTitle, usePdfExport } from "@/client/src/hooks/index.ts";
import { editConflict, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { characterDetailQuery, invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { characterPageState } from "@/client/src/pages/characters/characterPageState.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import {
  AddAdvancementDialog,
  type AddAdvancementDialogProps,
  CharacterModifiersDialog,
  EditAdvancementDialog,
  ShareDialog,
  type SheetSummaryWords,
} from "./components/index.ts";
import { useCharacterPermissions } from "./useCharacterPermissions.ts";

export default function CharacterDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id = "" } = useParams<{ id: string }>();
  const menu = useAnchorMenu();
  // Remove Last Level's confirmation, on the level the sheet showed last as it opened, which its removal names
  const removeAdvancement = useDialogState<{ advancementId: string }>();
  const [isArchiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isHardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  // A new character arrives with the Add Level wizard open (`openAddAdvancement`); a track's plus opens it, the track
  // planned
  const { openAddAdvancement } = characterPageState(location.state);
  const addAdvancement = useDialogState<Pick<AddAdvancementDialogProps, "trackId">>(openAddAdvancement ? {} : null);
  const editAdvancement = useDialogState<EditingAdvancement>();
  const [isShareOpen, setShareOpen] = useState(false);
  const [isContributorsOpen, setContributorsOpen] = useState(false);
  const [isModifiersOpen, setModifiersOpen] = useState(false);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const exportFn = () => parseResponse(rpc.api.characters[":characterId"].pdf.$post({ param: { characterId: id } }));
  const pdfExport = usePdfExport(exportFn);

  // The route always gives an id
  const { data: character, isLoading, error } = useQuery(characterDetailQuery(id));
  const {
    isArchived,
    isSubsheet,
    canArchive,
    canDownloadPdf,
    canEdit,
    canEditRows,
    canEditPortrait,
    canHardDelete,
    canInviteContributors,
    canLeave,
    canManageContributors,
    canReadContributors,
    canShare,
    canUnarchive,
  } = useCharacterPermissions(character);

  usePageTitle(character?.name);

  // Closing the wizard a new character arrived with clears that from its history entry: a reload or a Back doesn't
  // open it again
  const closeAddAdvancement = () => {
    addAdvancement.close();
    if (openAddAdvancement) navigate(location.pathname, { replace: true, state: {} });
  };

  // Its toasts in the words of the summary its confirmation was opened from; it removes the level the page showed last,
  // refused as stale once another page removed or added one
  const removeAdvancementMutation = useMutation({
    mutationFn: ({ advancementId }: { advancementId: string; words: SheetSummaryWords }) =>
      parseResponse(
        rpc.api.characters.advancements[":characterId"][":advancementId"].$delete({
          param: { characterId: id, advancementId },
        }),
      ),
    onSuccess: async (_, { words }) => {
      snackbar.success(words.removed);
      void invalidateCharacterListings(queryClient);
      await invalidateCharacter(queryClient, id);
      removeAdvancement.close();
    },
    onError: (error, { words }) => {
      snackbar.error(error, words.removeFailed);
      // Another page added or removed a level since: the sheet is read again, so the next removal names its last level
      if (editConflict(error)) {
        removeAdvancement.close();
        void invalidateCharacter(queryClient, id);
      }
    },
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
      <Container>
        <PageError
          message={loadFailureMessage("Character", error)}
          backLabel="Back to Characters"
          backTo={"/characters"}
        />
      </Container>
    );
  }

  const { parentCharacterId } = character;
  const { lastAdvancementId } = character.summary;

  // Its menu, each item as the server answers it, the character's state with it: an archived one's Unarchive, its
  // Delete Permanently under it, then what it does live
  const menuItems = [
    canUnarchive && (
      <ActionMenuItem
        key="unarchive"
        icon={UnarchiveIcon}
        label="Unarchive"
        intent="positive"
        onClick={menu.closeMenuAnd(() => unarchiveMutation.mutate())}
      />
    ),
    canHardDelete && (
      <ActionMenuItem
        key="hard-delete"
        icon={DeleteIcon}
        label="Delete Permanently"
        intent="destructive"
        onClick={menu.closeMenuAnd(() => setHardDeleteConfirmOpen(true))}
      />
    ),
    // Add Level, as a track's popover's plus offers for its track (a character with no level adds its first
    // here), and Remove Last Level, the menu's alone, in its summary's words
    canEditRows && (
      <ActionMenuItem
        key="add-advancement"
        icon={AddIcon}
        label={character.summary.words.add}
        onClick={menu.closeMenuAnd(() => addAdvancement.openWith({}))}
      />
    ),
    canEditRows && lastAdvancementId !== null && (
      <ActionMenuItem
        key="remove-advancement"
        icon={DeleteIcon}
        label={character.summary.words.removeLast}
        intent="destructive"
        onClick={menu.closeMenuAnd(
          () => lastAdvancementId !== null && removeAdvancement.openWith({ advancementId: lastAdvancementId }),
        )}
      />
    ),
    canEditRows && (
      <ActionMenuItem
        key="manage-modifiers"
        icon={ModifiersIcon}
        label="Manage Modifiers"
        onClick={menu.closeMenuAnd(() => setModifiersOpen(true))}
      />
    ),
    canDownloadPdf && (
      <ActionMenuItem
        key="download-pdf"
        icon={DownloadIcon}
        label="Download PDF"
        onClick={menu.closeMenuAnd(() => pdfExport.mutate())}
      />
    ),
    canReadContributors && (
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
  ];

  return (
    <PageTransition>
      <Container>
        <Stack spacing={4}>
          <CharacterHeader
            name={character.name}
            summary={character.summary}
            rulesetId={character.rulesetId}
            rulesetName={character.rulesetName}
            backTo={isSubsheet && parentCharacterId ? `/characters/${parentCharacterId}` : "/characters"}
            onAddAdvancement={canEditRows ? (trackId) => addAdvancement.openWith({ trackId }) : undefined}
            onEditAdvancement={canEditRows ? editAdvancement.openWith : undefined}
            onMenuOpen={menuItems.some(Boolean) ? menu.openMenu : undefined}
            rename={canEdit ? { characterId: id, updatedAt: character.updatedAt, parentCharacterId } : undefined}
          />
          <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
            {menuItems}
          </Menu>

          <DeleteDialog
            open={removeAdvancement.open}
            onClose={removeAdvancement.close}
            onConfirm={() =>
              removeAdvancement.target &&
              removeAdvancementMutation.mutate({
                advancementId: removeAdvancement.target.advancementId,
                words: character.summary.words,
              })
            }
            title={character.summary.words.removeLast}
            message={character.summary.words.removeLastMessage}
            pending={removeAdvancementMutation.isPending}
            confirmLabel={character.summary.words.removeLast}
          />

          <ConfirmDialog
            open={isArchiveConfirmOpen}
            onClose={() => setArchiveConfirmOpen(false)}
            onConfirm={() => archiveMutation.mutate()}
            title="Archive Character"
            message="Are you sure you want to archive this character? You can unarchive it at any time from the Archived filter."
            pending={archiveMutation.isPending}
            confirmLabel="Archive Character"
            intent="caution"
            confirmIcon={<ArchiveIcon />}
          />

          <DeleteDialog
            open={isHardDeleteConfirmOpen}
            onClose={() => setHardDeleteConfirmOpen(false)}
            onConfirm={() => hardDeleteMutation.mutate()}
            title="Delete Permanently"
            // What goes with it is its ruleset's to say
            message={character.summary.words.deleteMessage}
            pending={hardDeleteMutation.isPending}
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
            canLeave={canLeave}
            canManage={canManageContributors}
            invite={canInviteContributors}
          />

          <CharacterModifiersDialog
            open={isModifiersOpen}
            onClose={() => setModifiersOpen(false)}
            characterId={id}
            rulesetId={character.rulesetId}
          />

          {isArchived && <ArchivedNotice what="character" canUnarchive={canUnarchive} />}

          {addAdvancement.target && (
            <AddAdvancementDialog
              key={addAdvancement.key}
              open={addAdvancement.open}
              onClose={closeAddAdvancement}
              onExited={addAdvancement.onExited}
              characterId={id}
              lastAdvancementId={lastAdvancementId}
              trackId={addAdvancement.target.trackId}
              words={character.summary.words}
            />
          )}
          {editAdvancement.target && (
            <EditAdvancementDialog
              key={editAdvancement.key}
              open={editAdvancement.open}
              onClose={editAdvancement.close}
              onExited={editAdvancement.onExited}
              characterId={id}
              editingAdvancement={editAdvancement.target}
              words={character.summary.words}
            />
          )}

          {/* A subsheet's rows are the character's it's under, which its permissions answer: its own sheet shows its
              inventory as a campaign's or a link's does, and links no subsheet of its own */}
          <CharacterSheetBody
            character={character}
            characterId={id}
            readOnly={!canEditRows}
            identityReadOnly={!canEdit}
            portraitReadOnly={!canEditPortrait}
            subsheetsLinkable={!isSubsheet}
            rulesetId={character.rulesetId}
            diagnostics={isSubsheet ? undefined : character}
          />
        </Stack>
      </Container>
    </PageTransition>
  );
}
