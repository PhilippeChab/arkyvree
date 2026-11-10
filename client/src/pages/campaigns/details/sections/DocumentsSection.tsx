import { Box, Button, IconButton, Menu, Stack, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type DragEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ActionMenuItem,
  AddButton,
  BlankState,
  CLICKABLE_ROW_SX,
  clickableProps,
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  ListToolbar,
  LoadError,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SectionContent,
  StatusChip,
  SubsectionTitle,
  type TableColumn,
  TableSkeleton,
} from "@/client/src/components/common/index.ts";
import {
  ArrowBackIcon,
  DeleteIcon,
  DocumentIcon,
  EditIcon,
  FolderIcon,
  MoveIcon,
  NoteIcon,
  UploadFileIcon,
  VisibilityIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, useDialogState, useFormWith, useSearchParam } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { type CampaignDetail } from "@/client/src/pages/campaigns/campaignQueries.ts";
import {
  campaignDocumentsQuery,
  campaignSeatsQuery,
  invalidateCampaignDocuments,
} from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { useCampaignPermissions } from "@/client/src/pages/campaigns/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  countDocumentDepth,
  type DocumentKind,
  findDocumentPath,
  MAX_DOCUMENT_DEPTH,
} from "@/shared/campaignDocuments.ts";

import { DeleteDocumentDialog, DocumentFormDialog, MoveDocumentDialog, ReplaceFileDialog } from "./DocumentDialogs.tsx";
import {
  buildTree,
  type CampaignDocument,
  describeAudience,
  describeFileRefusal,
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_ICONS,
  type DocumentEdit,
  type DocumentFormData,
  EMPTY_DOCUMENT_FORM,
  listFolder,
  readDocumentIconKind,
  readSeatNames,
  toDocumentBody,
  toDocumentEdit,
  toDocumentName,
  toDocumentUpload,
  toEditForm,
} from "./documents.ts";
import { useReplaceDocumentFile } from "./useReplaceDocumentFile.ts";

interface DocumentsSectionProps {
  campaign: CampaignDetail;
}

/** A new item's dialog: its kind, and the folder it goes in. */
interface NewItem {
  kind: DocumentKind;
  parentId: string | null;
}

/** An edit opened from a row: the item, and the form it opened on, which says what the edit changed. */
interface OpenedEdit {
  item: CampaignDocument;
  opened: DocumentFormData;
}

/** The list, which takes a dropped file: the outline it shows while one is held over it. */
const DROP_ZONE_SX = { borderRadius: 2, outline: "2px dashed transparent", outlineOffset: 4 } as const;

/** The list while a file is held over it. */
const DROPPING_SX = { outlineColor: "primary.main", bgcolor: "action.hover" } as const;

/** A button as wide as the toolbar on a phone, as wide as its words from `sm` up. */
const FULL_ON_PHONE_SX = { width: { xs: "100%", sm: "auto" } };

/** A Game Master's table where they keep the documents: whom each item admits, and its actions. */
const MASTER_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "50%" },
  { key: "visibility", label: "Visibility", width: "20%" },
  { key: "updated", label: "Updated", width: "20%" },
  { align: "right", key: "actions", label: "Actions", width: "10%" },
];

/** A player's table: what each item is, and when it changed. */
const PLAYER_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "70%" },
  { key: "updated", label: "Updated", width: "30%" },
];

/** A Game Master's table where they can't change anything (an archived campaign's): whom each item admits. */
const READER_COLUMNS: TableColumn[] = MASTER_COLUMNS.filter(({ key }) => key !== "actions");

export function DocumentsSection({ campaign }: DocumentsSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const { canManageDocuments } = useCampaignPermissions(campaign);
  const { value: folderParam, setValue: setFolder } = useSearchParam("folder");
  const documents = useQuery(campaignDocumentsQuery(campaign.id));
  const items = documents.data?.items ?? [];
  // Its Game Masters read whom each item admits, an archived campaign's too; a player reads none of it
  const isGameMaster = !!documents.data?.isGameMaster;
  const seats = useQuery(campaignSeatsQuery(isGameMaster ? campaign.id : null));
  const { playerNames, seatNames } = readSeatNames(seats.data?.items ?? []);
  // Who sees each item, by name once the players have loaded, by how many until then
  const audienceNames = seats.data ? seatNames : undefined;

  // The hidden file input Upload File opens, in state: its buttons hand their click on to it
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const addMenu = useAnchorMenu();
  const replace = useReplaceDocumentFile(campaign.id);
  const createDialog = useDialogState<NewItem>();
  const editDialog = useDialogState<OpenedEdit>();
  const moveDialog = useDialogState<CampaignDocument>();
  const deleteDialog = useDialogState<CampaignDocument>();
  const createForm = useFormWith<DocumentFormData>(EMPTY_DOCUMENT_FORM);
  const editForm = useFormWith<DocumentFormData>(EMPTY_DOCUMENT_FORM);

  // A folder that's gone, or hidden from the session, opens the top
  const tree = buildTree(items);
  const folder = tree.get(folderParam)?.kind === "Folder" ? tree.get(folderParam) : undefined;
  const folderId = folder?.id ?? null;
  const shown = listFolder(items, folderId);
  const path = folder ? findDocumentPath(tree, folder.id) : [];
  const parent = path.at(-1);
  const canAddFolder = countDocumentDepth(tree, folderId) < MAX_DOCUMENT_DEPTH;
  const columns = !isGameMaster ? PLAYER_COLUMNS : canManageDocuments ? MASTER_COLUMNS : READER_COLUMNS;
  const newItem = createDialog.target;

  // A document is uploaded with its file, in one request; a folder and a note are created as they're typed
  const createMutation = useMutation({
    mutationFn: ({ kind, parentId, data }: NewItem & { data: DocumentFormData }) => {
      const param = { id: campaign.id };
      const api = rpc.api.campaigns[":id"].documents;
      if (kind !== "Document")
        return parseResponse(api.$post({ param, json: { parentId, ...toDocumentBody(data, kind) } }));
      if (!data.file) throw new Error("Pick a file");
      return parseResponse(api.upload.$post({ param, form: toDocumentUpload(data, data.file, parentId) }));
    },
    onSuccess: (created) => {
      snackbar.success(`${created.kind} ${created.kind === "Document" ? "uploaded" : "created"}`);
      invalidateCampaignDocuments(queryClient, campaign.id);
      createDialog.close();
    },
    onError: (error, { kind }) =>
      snackbar.error(error, `Failed to ${kind === "Document" ? "upload document" : `create ${kind.toLowerCase()}`}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ item, json }: { item: CampaignDocument; json: DocumentEdit }) =>
      parseResponse(
        rpc.api.campaigns[":id"].documents[":documentId"].$put({
          param: { id: campaign.id, documentId: item.id },
          json: { ...json, updatedAt: item.updatedAt },
        }),
      ),
    onSuccess: (updated, { json }) => {
      snackbar.success(`${updated.kind} ${"parentId" in json ? "moved" : "updated"}`);
      invalidateCampaignDocuments(queryClient, campaign.id);
      editDialog.close();
      moveDialog.close();
    },
    onError: (error, { item }) => snackbar.error(error, `Failed to update ${item.kind.toLowerCase()}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: CampaignDocument) =>
      parseResponse(
        rpc.api.campaigns[":id"].documents[":documentId"].$delete({ param: { id: campaign.id, documentId: item.id } }),
      ),
    onSuccess: (_deleted, item) => {
      snackbar.success(`${item.kind} deleted`);
      invalidateCampaignDocuments(queryClient, campaign.id);
      deleteDialog.close();
    },
    onError: (error, item) => snackbar.error(error, `Failed to delete ${item.kind.toLowerCase()}`),
  });

  const handleAdd = (kind: "Folder" | "Note") => {
    createForm.reset(EMPTY_DOCUMENT_FORM);
    createDialog.openWith({ kind, parentId: folderId });
  };

  // A file dropped beside the list isn't the browser's to open, which would leave the app: nothing takes it there
  useEffect(() => {
    if (!canManageDocuments) return undefined;
    const ignore = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", ignore);
    window.addEventListener("drop", ignore);
    return () => {
      window.removeEventListener("dragover", ignore);
      window.removeEventListener("drop", ignore);
    };
  }, [canManageDocuments]);

  // A file dropped on the list is uploaded as one picked is: one at a time
  const dropProps = canManageDocuments
    ? {
        onDragOver: (event: DragEvent) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDropping(true);
        },
        onDragLeave: (event: DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
        },
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          setDropping(false);
          const [file, ...others] = event.dataTransfer.files;
          if (others.length > 0) return snackbar.warning("Drop one file at a time");
          if (file) handleUpload(file);
        },
      }
    : {};

  // A document starts from its file: picked first, checked, then named after it in its dialog
  const handleUpload = (file: File) => {
    const refusal = describeFileRefusal(file);
    if (refusal) return snackbar.warning(refusal);
    createForm.reset({ ...EMPTY_DOCUMENT_FORM, file, name: toDocumentName(file.name) });
    createDialog.openWith({ kind: "Document", parentId: folderId });
  };

  const handleEdit = (item: CampaignDocument) => {
    const opened = toEditForm(item, seats.data ? seatNames : undefined);
    editForm.reset(opened);
    editDialog.openWith({ item, opened });
  };

  const handleOpen = (item: CampaignDocument) => {
    if (item.kind === "Folder") setFolder(item.id);
    else navigate(`/campaigns/${campaign.id}/documents/${item.id}`);
  };

  // Inside a folder, the way up and its name; deeper in, the folders above it under its name
  const folderHeading = folder && (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
      <Tooltip title={`Back to ${parent?.name ?? "Documents"}`}>
        <IconButton aria-label={`Back to ${parent?.name ?? "Documents"}`} onClick={() => setFolder(parent?.id ?? "")}>
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>
      <Box sx={{ minWidth: 0 }}>
        <SubsectionTitle>{folder.name}</SubsectionTitle>
        {path.length > 0 && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            In {path.map(({ name }) => name).join(" › ")}
          </Typography>
        )}
      </Box>
    </Stack>
  );
  // One button for what a Game Master adds here: a file first, then a note or a folder
  const addActions = canManageDocuments && <AddButton label="Add" onClick={addMenu.openMenu} sx={FULL_ON_PHONE_SX} />;

  return (
    <SectionContent>
      <Stack spacing={3}>
        {(folderHeading || addActions) && <ListToolbar actions={addActions}>{folderHeading}</ListToolbar>}

        <Box {...dropProps} sx={[DROP_ZONE_SX, dropping && DROPPING_SX]}>
          {documents.isLoading ? (
            <TableSkeleton columns={columns} />
          ) : !documents.data ? (
            <LoadError what="Documents" error={documents.error} onRetry={() => documents.refetch()} />
          ) : shown.length === 0 ? (
            <BlankState
              icon={DocumentIcon}
              title={folder ? "This folder is empty" : "No documents yet"}
              description={
                isGameMaster
                  ? canManageDocuments
                    ? "Upload your maps and handouts, or drop a file here, and choose what each player sees"
                    : "Nothing was kept here"
                  : "Your Game Masters haven't shared anything with you here yet"
              }
              action={
                canManageDocuments && !folder ? (
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<UploadFileIcon />}
                    onClick={() => fileInput?.click()}
                  >
                    Upload Your First Document
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DataTable framed columns={columns} sx={{ width: "100%" }}>
              {shown.map((item) => {
                const KindIcon = DOCUMENT_ICONS[readDocumentIconKind(item)];
                return (
                  <DataRow
                    key={item.id}
                    {...clickableProps(() => handleOpen(item))}
                    aria-label={`Open ${item.name}`}
                    sx={{ ...CLICKABLE_ROW_SX, ...ROW_ACTIONS_HOVER_SX }}
                  >
                    <DataCell slot="primary">
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                        <KindIcon fontSize="small" sx={{ color: "text.secondary" }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {item.name}
                          </Typography>
                          {item.audience && (
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              {describeAudience(item.audience, audienceNames)}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </DataCell>
                    {isGameMaster && (
                      <DataCell slot="inline">
                        {item.visibility ? (
                          <StatusChip icon={<VisibilityIcon />} label={item.visibility} />
                        ) : (
                          <EmptyValue />
                        )}
                      </DataCell>
                    )}
                    <DataCell slot="hidden">
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {formatDate(item.updatedAt)}
                      </Typography>
                    </DataCell>
                    {isGameMaster && canManageDocuments && (
                      <DataCell slot="trailing" align="right">
                        <RowActions>
                          <RowAction icon={EditIcon} label="Edit" onClick={() => handleEdit(item)} />
                          {item.kind === "Document" && (
                            <RowAction icon={UploadFileIcon} label="Replace File" onClick={() => replace.start(item)} />
                          )}
                          <RowAction icon={MoveIcon} label="Move" onClick={() => moveDialog.openWith(item)} />
                          <RowAction
                            icon={DeleteIcon}
                            label="Delete"
                            intent="destructive"
                            onClick={() => deleteDialog.openWith(item)}
                          />
                        </RowActions>
                      </DataCell>
                    )}
                  </DataRow>
                );
              })}
            </DataTable>
          )}
        </Box>
      </Stack>

      <Menu anchorEl={addMenu.anchorEl} open={addMenu.open} onClose={addMenu.closeMenu}>
        <ActionMenuItem
          icon={UploadFileIcon}
          label="Upload File"
          onClick={addMenu.closeMenuAnd(() => fileInput?.click())}
        />
        <ActionMenuItem icon={NoteIcon} label="New Note" onClick={addMenu.closeMenuAnd(() => handleAdd("Note"))} />
        {/* A folder can't stand deeper than its depth allows: its item says why it's off there */}
        <ActionMenuItem
          icon={FolderIcon}
          label="New Folder"
          disabled={!canAddFolder}
          reason={`Folders nest ${MAX_DOCUMENT_DEPTH} deep at most`}
          onClick={addMenu.closeMenuAnd(() => handleAdd("Folder"))}
        />
      </Menu>

      {canManageDocuments && (
        <input
          ref={setFileInput}
          aria-label="Upload File"
          type="file"
          accept={DOCUMENT_FILE_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so picking the same file again fires its change
            event.target.value = "";
            if (file) handleUpload(file);
          }}
        />
      )}
      {canManageDocuments && <input {...replace.inputProps} />}
      <ReplaceFileDialog {...replace.dialogProps} />
      <DocumentFormDialog
        mode="create"
        open={createDialog.open}
        onClose={createDialog.close}
        form={createForm}
        item={{ id: "new", kind: newItem?.kind ?? "Document", name: "", parentId: newItem?.parentId ?? null }}
        items={items}
        playerNames={playerNames}
        seatNames={seatNames}
        seatsError={seats.error}
        withText
        onSubmit={(data) => newItem && createMutation.mutate({ ...newItem, data })}
        pending={createMutation.isPending}
      />
      <DocumentFormDialog
        mode="edit"
        open={editDialog.open}
        onClose={editDialog.close}
        form={editForm}
        item={editDialog.target?.item ?? { id: "", kind: "Document", name: "", parentId: null }}
        items={items}
        playerNames={playerNames}
        seatNames={seatNames}
        seatsError={seats.error}
        withText={false}
        onSubmit={(data) => {
          const target = editDialog.target;
          if (target) updateMutation.mutate({ item: target.item, json: toDocumentEdit(data, target.opened, false) });
        }}
        pending={updateMutation.isPending}
      />
      {moveDialog.target && (
        <MoveDocumentDialog
          key={moveDialog.key}
          open={moveDialog.open}
          onClose={moveDialog.close}
          onExited={moveDialog.onExited}
          item={moveDialog.target}
          items={items}
          playerNames={playerNames}
          onMove={(parentId) => {
            if (moveDialog.target) updateMutation.mutate({ item: moveDialog.target, json: { parentId } });
          }}
          pending={updateMutation.isPending}
        />
      )}
      <DeleteDocumentDialog
        open={deleteDialog.open}
        onClose={deleteDialog.close}
        item={deleteDialog.target}
        items={items}
        onConfirm={() => deleteDialog.target && deleteMutation.mutate(deleteDialog.target)}
        pending={deleteMutation.isPending}
      />
    </SectionContent>
  );
}
