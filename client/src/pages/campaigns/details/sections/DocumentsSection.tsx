import { Box, Breadcrumbs, MenuItem, Stack, TextField, Typography } from "@mui/material";
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
  LinkButton,
  ListToolbar,
  LoadError,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SectionContent,
  StatusChip,
  type TableColumn,
  TableSkeleton,
} from "@/client/src/components/common/index.ts";
import { DeleteIcon, DocumentIcon, EditIcon, MoveIcon, VisibilityIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith, useSearchParam } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
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
import {
  buildTree,
  type CampaignDocument,
  describeAudience,
  DOCUMENT_KIND_ICONS,
  type DocumentEdit,
  type DocumentFormData,
  EMPTY_DOCUMENT_FORM,
  filterSeenBy,
  listFolder,
  readSeatNames,
  toDocumentBody,
} from "./documents.ts";

interface DocumentsSectionProps {
  campaign: CampaignDetail;
}

/** A new item's dialog: its kind, and the folder it goes in. */
interface NewItem {
  kind: DocumentKind;
  parentId: string | null;
}

/** A button as wide as the toolbar on a phone, as wide as its words from `sm` up. */
const FULL_ON_PHONE_SX = { width: { xs: "100%", sm: "auto" } };

/** Its Game Masters' table: whom each item admits, and its actions. */
const MASTER_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "50%" },
  { key: "visibility", label: "Visibility", width: "20%" },
  { key: "updated", label: "Updated", width: "20%" },
  { align: "right", key: "actions", label: "Actions", width: "10%" },
];

/** The name of the item a new one goes in, as the Add buttons name it */
const NEW_ITEM_IDS: Record<DocumentKind, string> = { Document: "new-document", Folder: "new-folder" };

/** A player's table: what each item is, and when it changed. */
const PLAYER_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "70%" },
  { key: "updated", label: "Updated", width: "30%" },
];

export function DocumentsSection({ campaign }: DocumentsSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const { canManageDocuments } = useCampaignPermissions(campaign);
  const { value: folderParam, setValue: setFolder } = useSearchParam("folder");
  const { value: viewAs, setValue: setViewAs } = useSearchParam("viewAs");
  const documents = useQuery(campaignDocumentsQuery(campaign.id));
  const items = documents.data?.items ?? [];
  // Its Game Masters read whom each item admits; a player reads none of it
  const isGameMaster = canManageDocuments || items.some((item) => item.audience);
  const seats = useQuery(campaignSeatsQuery(isGameMaster ? campaign.id : null));
  const { playerNames, seatNames } = readSeatNames(seats.data?.items ?? []);

  const [newItem, setNewItem] = useState<NewItem>({ kind: "Document", parentId: null });
  const [createOpen, setCreateOpen] = useState(false);
  const editDialog = useDialogState<CampaignDocument>();
  const moveDialog = useDialogState<CampaignDocument>();
  const deleteDialog = useDialogState<CampaignDocument>();
  const createForm = useFormWith<DocumentFormData>(EMPTY_DOCUMENT_FORM);
  const editForm = useFormWith<DocumentFormData>(EMPTY_DOCUMENT_FORM);

  // A folder that's gone, or hidden from the session, opens the top
  const tree = buildTree(items);
  const folderId = tree.get(folderParam)?.kind === "Folder" ? folderParam : null;
  const seen = isGameMaster && viewAs ? filterSeenBy(items, viewAs) : items;
  const shown = folderId && !seen.some((item) => item.id === folderId) ? [] : listFolder(seen, folderId);
  const path = folderId
    ? [...findDocumentPath(tree, folderId), { id: folderId, name: tree.get(folderId)?.name ?? "" }]
    : [];
  const canAddFolder = countDocumentDepth(tree, folderId) < MAX_DOCUMENT_DEPTH;
  const manages = canManageDocuments && !viewAs;

  const createMutation = useMutation({
    mutationFn: (data: DocumentFormData) =>
      parseResponse(
        rpc.api.campaigns[":id"].documents.$post({
          param: { id: campaign.id },
          json: {
            kind: newItem.kind,
            parentId: newItem.parentId,
            ...toDocumentBody(data, newItem.kind === "Document"),
          },
        }),
      ),
    onSuccess: (created) => {
      snackbar.success(`${created.kind} created`);
      invalidateCampaignDocuments(queryClient, campaign.id);
      setCreateOpen(false);
    },
    onError: (error) => snackbar.error(error, `Failed to create ${newItem.kind.toLowerCase()}`),
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

  const handleAdd = (kind: DocumentKind) => {
    setNewItem({ kind, parentId: folderId });
    createForm.reset(EMPTY_DOCUMENT_FORM);
    setCreateOpen(true);
  };

  const handleEdit = (item: CampaignDocument) => {
    editForm.reset({
      body: "",
      name: item.name,
      readerIds: item.readerIds ?? [],
      visibility: item.visibility ?? "Private",
    });
    editDialog.openWith(item);
  };

  const handleOpen = (item: CampaignDocument) => {
    if (item.kind === "Folder") setFolder(item.id);
    else navigate(`/campaigns/${campaign.id}/documents/${item.id}`);
  };

  const columns = isGameMaster ? MASTER_COLUMNS : PLAYER_COLUMNS;
  // On a phone, under what narrows the list, a line each
  const addActions = manages && (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: { xs: "100%", sm: "auto" } }}>
      <AddButton
        label="Add Folder"
        onClick={() => handleAdd("Folder")}
        disabled={!canAddFolder}
        sx={FULL_ON_PHONE_SX}
      />
      <AddButton label="Add Document" onClick={() => handleAdd("Document")} sx={FULL_ON_PHONE_SX} />
    </Stack>
  );

  return (
    <SectionContent>
      <Stack spacing={3}>
        <ListToolbar actions={addActions}>
          <Breadcrumbs aria-label="Folders">
            {path.length > 0 ? (
              <LinkButton onClick={() => setFolder("")}>Documents</LinkButton>
            ) : (
              <Typography sx={{ fontWeight: 500 }}>Documents</Typography>
            )}
            {path.map((folder, index) =>
              index < path.length - 1 ? (
                <LinkButton key={folder.id} onClick={() => setFolder(folder.id)}>
                  {folder.name}
                </LinkButton>
              ) : (
                <Typography key={folder.id} sx={{ fontWeight: 500 }}>
                  {folder.name}
                </Typography>
              ),
            )}
          </Breadcrumbs>
          {isGameMaster && (
            <TextField
              select
              size="small"
              label="View As"
              value={viewAs}
              onChange={(event) => setViewAs(event.target.value)}
              error={!!seats.error}
              helperText={seats.error ? loadFailureMessage("Players", seats.error) : undefined}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Game Master</MenuItem>
              {[...seatNames].map(([id, name]) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </ListToolbar>

        {documents.isLoading ? (
          <TableSkeleton columns={columns} />
        ) : !documents.data ? (
          <LoadError what="Documents" error={documents.error} onRetry={() => documents.refetch()} />
        ) : shown.length === 0 ? (
          <BlankState
            icon={DocumentIcon}
            title={folderId ? "This folder is empty" : "No documents yet"}
            description={
              isGameMaster
                ? "Keep your notes here, and choose what each player sees"
                : "Your Game Masters haven't shared anything with you here yet"
            }
            action={
              manages ? (
                <AddButton
                  variant="outlined"
                  size="large"
                  label="Add a Document"
                  onClick={() => handleAdd("Document")}
                />
              ) : undefined
            }
          />
        ) : (
          <DataTable framed columns={columns} sx={{ width: "100%" }}>
            {shown.map((item) => {
              const KindIcon = DOCUMENT_KIND_ICONS[item.kind];
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
                            {describeAudience(item.audience, seatNames)}
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
                  {isGameMaster && (
                    <DataCell slot={manages ? "trailing" : "hidden"} align="right">
                      {manages && (
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
                      )}
                    </DataCell>
                  )}
                </DataRow>
              );
            })}
          </DataTable>
        )}
      </Stack>

      <DocumentFormDialog
        mode="create"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        form={createForm}
        item={{ id: NEW_ITEM_IDS[newItem.kind], kind: newItem.kind, name: "", parentId: newItem.parentId }}
        items={items}
        playerNames={playerNames}
        seatNames={seatNames}
        seatsError={seats.error}
        withText={newItem.kind === "Document"}
        onSubmit={(data) => createMutation.mutate(data)}
        pending={createMutation.isPending}
      />
      <DocumentFormDialog
        mode="edit"
        open={editDialog.open}
        onClose={editDialog.close}
        form={editForm}
        item={editDialog.target ?? { id: "", kind: "Document", name: "", parentId: null }}
        items={items}
        playerNames={playerNames}
        seatNames={seatNames}
        seatsError={seats.error}
        withText={false}
        onSubmit={(data) => {
          if (editDialog.target) updateMutation.mutate({ item: editDialog.target, json: toDocumentBody(data, false) });
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
        item={deleteDialog.target ?? null}
        items={items}
        onConfirm={() => deleteDialog.target && deleteMutation.mutate(deleteDialog.target)}
        pending={deleteMutation.isPending}
      />
    </SectionContent>
  );
}
