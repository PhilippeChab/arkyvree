import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
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
  MoveIcon,
  UploadFileIcon,
  VisibilityIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith, useSearchParam } from "@/client/src/hooks/index.ts";
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

import { DeleteDocumentDialog, DocumentFormDialog, MoveDocumentDialog } from "./DocumentDialogs.tsx";
import { describeFileSave, saveDocumentFileFn } from "./documentFiles.ts";
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

  // An edit's file goes once the rest is saved, a version another Game Master changed meanwhile refused first
  const updateMutation = useMutation({
    mutationFn: async ({
      item,
      json,
      file,
    }: {
      file?: DocumentFormData;
      item: CampaignDocument;
      json: DocumentEdit;
    }) => {
      const updated = await parseResponse(
        rpc.api.campaigns[":id"].documents[":documentId"].$put({
          param: { id: campaign.id, documentId: item.id },
          json: { ...json, updatedAt: item.updatedAt },
        }),
      );
      return { updated, fileError: file ? await saveDocumentFileFn(campaign.id, item.id, file) : null };
    },
    onSuccess: ({ updated, fileError }, { json }) => {
      const { message, severity } = describeFileSave(
        `${updated.kind} ${"parentId" in json ? "moved" : "updated"}`,
        fileError,
      );
      snackbar[severity](message);
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
  // A folder can't stand deeper than its depth allows: Add Folder says why it's off there
  const addFolder = (
    <AddButton label="Add Folder" onClick={() => handleAdd("Folder")} disabled={!canAddFolder} sx={FULL_ON_PHONE_SX} />
  );
  const addActions = canManageDocuments && (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={FULL_ON_PHONE_SX}>
      {canAddFolder ? (
        addFolder
      ) : (
        <Tooltip title={`Folders Nest ${MAX_DOCUMENT_DEPTH} Deep at Most`}>
          <Box component="span" sx={FULL_ON_PHONE_SX}>
            {addFolder}
          </Box>
        </Tooltip>
      )}
      <AddButton label="Add Note" onClick={() => handleAdd("Note")} sx={FULL_ON_PHONE_SX} />
      <Button
        variant="contained"
        startIcon={<UploadFileIcon />}
        onClick={() => fileInput?.click()}
        sx={FULL_ON_PHONE_SX}
      >
        Upload File
      </Button>
    </Stack>
  );

  return (
    <SectionContent>
      <Stack spacing={3}>
        {(folderHeading || addActions) && <ListToolbar actions={addActions}>{folderHeading}</ListToolbar>}

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
                ? "Keep your maps, handouts and notes here, and choose what each player sees"
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
      </Stack>

      {canManageDocuments && (
        <input
          ref={setFileInput}
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
          if (target)
            updateMutation.mutate({ item: target.item, json: toDocumentEdit(data, target.opened, false), file: data });
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
