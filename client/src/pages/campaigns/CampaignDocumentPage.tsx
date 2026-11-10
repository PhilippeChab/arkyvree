import { Box, Button, Container, Menu, Link as MuiLink, Stack, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import {
  ActionMenuItem,
  BlankNote,
  DetailPageHeader,
  DiceSpinner,
  LoadError,
  PageError,
  PageLoader,
  PageTransition,
  Panel,
  StatusChip,
} from "@/client/src/components/common/index.ts";
import {
  DeleteIcon,
  EditIcon,
  OpenInNewIcon,
  UploadFileIcon,
  VisibilityIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, useDialogState, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { campaignDetailQuery, campaignDocumentQuery, campaignDocumentTextQuery } from "./campaignQueries.ts";
import { campaignDocumentsQuery, campaignSeatsQuery, invalidateCampaignDocuments } from "./details/sectionQueries.ts";
import {
  DeleteDocumentDialog,
  describeAudience,
  describeDocumentFile,
  DOCUMENT_ICONS,
  type DocumentFile,
  type DocumentFormData,
  DocumentFormDialog,
  EMPTY_DOCUMENT_FORM,
  MAX_SHOWN_TEXT_BYTES,
  readFileKind,
  readSeatNames,
  ReplaceFileDialog,
  toDocumentEdit,
  toDocumentFileUrl,
  toEditForm,
  useReplaceDocumentFile,
} from "./details/sections/index.ts";
import { useCampaignPermissions } from "./hooks/index.ts";

interface DocumentFilePanelProps {
  campaignId: string;
  documentId: string;
  file: DocumentFile;
  /** Its document's name, a picture's alternative text. */
  name: string;
}

/** A picture's height at most, so what's under it stays in reach. */
const PICTURE_MAX_HEIGHT = "60vh";

/**
 * A document's file, by what it is. A picture is shown whole, alone, and opens at its full size when it's clicked; a
 * text file's words are shown, over the link that opens it in its own tab (one too large to show has the link alone).
 * A PDF is its file's name, kind and size, and what opens it in its own tab, the browser's reader.
 */
function DocumentFilePanel({ campaignId, documentId, file, name }: DocumentFilePanelProps) {
  const kind = readFileKind(file);
  const FileIcon = DOCUMENT_ICONS[kind];
  const url = toDocumentFileUrl(campaignId, documentId, file);
  const text = useQuery(campaignDocumentTextQuery(campaignId, documentId, file));

  if (kind === "Pdf") {
    return (
      <Panel>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0, maxWidth: "100%" }}>
            <FileIcon sx={{ color: "text.secondary" }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                {file.name}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {describeDocumentFile(file)}
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            startIcon={<OpenInNewIcon />}
            href={url}
            target="_blank"
            rel="noopener"
            sx={{ flexShrink: 0 }}
          >
            Open PDF
          </Button>
        </Stack>
      </Panel>
    );
  }

  if (kind === "Picture") {
    return (
      <Panel>
        <Stack sx={{ alignItems: "center" }}>
          <Tooltip title="Open Full Size">
            <Box
              component="a"
              href={url}
              target="_blank"
              rel="noopener"
              aria-label={`Open ${name} Full Size`}
              sx={{ display: "block", maxWidth: "100%", cursor: "zoom-in", lineHeight: 0 }}
            >
              <Box
                component="img"
                src={url}
                alt={name}
                sx={{ maxWidth: "100%", maxHeight: PICTURE_MAX_HEIGHT, borderRadius: 1, objectFit: "contain" }}
              />
            </Box>
          </Tooltip>
        </Stack>
      </Panel>
    );
  }

  return (
    <Panel>
      <Stack spacing={2}>
        {text.data !== undefined && (
          <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {text.data}
          </Typography>
        )}
        {file.byteSize > MAX_SHOWN_TEXT_BYTES && <BlankNote>This file is too large to show here</BlankNote>}
        {text.isLoading && <DiceSpinner />}
        {text.error && <LoadError what="Text" error={text.error} onRetry={() => text.refetch()} />}
        <Typography variant="caption">
          <MuiLink href={url} target="_blank" rel="noopener" underline="hover">
            Open Text File
          </MuiLink>
        </Typography>
      </Stack>
    </Panel>
  );
}

/** The Documents tab, open at a folder (`folderId`), or at its top. */
function documentsTab(campaignId: string, folderId: string | null) {
  return `/campaigns/${campaignId}/documents${folderId ? `?folder=${folderId}` : ""}`;
}

export default function CampaignDocumentPage() {
  const { id: campaignId = "", documentId = "" } = useParams<{ documentId: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const menu = useAnchorMenu();
  // The edit keeps the version and the form it opened on: another Game Master's save meanwhile is refused, not lost
  const editDialog = useDialogState<{ opened: DocumentFormData; updatedAt: string }>();
  const deleteDialog = useDialogState();
  const editForm = useFormWith<DocumentFormData>(EMPTY_DOCUMENT_FORM);
  const replace = useReplaceDocumentFile(campaignId);

  const { data, isLoading, error: documentError } = useQuery(campaignDocumentQuery(campaignId, documentId));
  const { data: campaign, error: campaignError } = useQuery(campaignDetailQuery(campaignId));
  const { canManageDocuments } = useCampaignPermissions(campaign);
  // Its tree and its seats, which its Game Master's edit previews whom it shows the document to with
  const tree = useQuery({ ...campaignDocumentsQuery(campaignId), enabled: canManageDocuments });
  const seats = useQuery(campaignSeatsQuery(canManageDocuments ? campaignId : null));
  const { playerNames, seatNames } = readSeatNames(seats.data?.items ?? []);

  usePageTitle(data?.name);

  const updateMutation = useMutation({
    mutationFn: ({
      form,
      opened,
      updatedAt,
    }: {
      form: DocumentFormData;
      opened: DocumentFormData;
      updatedAt: string;
    }) =>
      parseResponse(
        rpc.api.campaigns[":id"].documents[":documentId"].$put({
          param: { id: campaignId, documentId },
          // A note's text alone: a document is its file, and a body sent for one is refused
          json: { ...toDocumentEdit(form, opened, data?.kind === "Note"), updatedAt },
        }),
      ),
    onSuccess: (updated) => {
      snackbar.success(`${updated.kind} updated`);
      invalidateCampaignDocuments(queryClient, campaignId);
      editDialog.close();
    },
    onError: (error) => snackbar.error(error, `Failed to update ${(data?.kind ?? "Document").toLowerCase()}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.campaigns[":id"].documents[":documentId"].$delete({ param: { id: campaignId, documentId } }),
      ),
    onSuccess: () => {
      snackbar.success(`${data?.kind ?? "Document"} deleted`);
      invalidateCampaignDocuments(queryClient, campaignId);
      navigate(documentsTab(campaignId, data?.parentId ?? null));
      // Gone: don't let Back render it from the cache
      queryClient.removeQueries({ queryKey: QUERY_KEYS.campaigns.documentDetail(campaignId, documentId) });
    },
    onError: (error) => snackbar.error(error, `Failed to delete ${(data?.kind ?? "Document").toLowerCase()}`),
  });

  if (isLoading) {
    return (
      <Container>
        <PageLoader />
      </Container>
    );
  }

  // A passing refetch failure keeps the loaded page; a deleted or hidden document, or a lost campaign, leaves it
  const failure = documentError ?? campaignError;
  if (!data || (!campaign && campaignError) || accessLost(failure)) {
    return (
      <Container>
        <PageError
          message={loadFailureMessage("Document", failure)}
          backLabel="Back to Documents"
          backTo={documentsTab(campaignId, null)}
        />
      </Container>
    );
  }

  // A folder opens in the tab, at its own level
  if (data.kind === "Folder") return <Navigate to={documentsTab(campaignId, data.id)} replace />;

  const backTo = documentsTab(campaignId, data.parentId);
  const where = ["Documents", ...data.path.map(({ name }) => name)].join(" › ");
  const menuItems = [
    canManageDocuments && (
      <ActionMenuItem
        key="edit"
        icon={EditIcon}
        label="Edit"
        onClick={menu.closeMenuAnd(() => {
          const opened = toEditForm(data, seats.data ? seatNames : undefined);
          editForm.reset(opened);
          editDialog.openWith({ opened, updatedAt: data.updatedAt });
        })}
      />
    ),
    canManageDocuments && data.kind === "Document" && (
      <ActionMenuItem
        key="replace"
        icon={UploadFileIcon}
        label="Replace File"
        onClick={menu.closeMenuAnd(() => replace.start(data))}
      />
    ),
    canManageDocuments && (
      <ActionMenuItem
        key="delete"
        icon={DeleteIcon}
        label="Delete Permanently"
        intent="destructive"
        onClick={menu.closeMenuAnd(() => deleteDialog.openWith(true))}
      />
    ),
  ];

  return (
    <PageTransition>
      <Container>
        <Stack spacing={4}>
          <DetailPageHeader
            title={data.name}
            backTo={backTo}
            onMenuOpen={menuItems.some(Boolean) ? menu.openMenu : undefined}
            chips={data.visibility && <StatusChip icon={<VisibilityIcon />} label={data.visibility} />}
            description={
              data.audience
                ? `In ${where} · ${describeAudience(data.audience, seats.data ? seatNames : undefined)}`
                : `In ${where}`
            }
          />
          {data.file && (
            <DocumentFilePanel campaignId={campaignId} documentId={documentId} file={data.file} name={data.name} />
          )}
          {data.kind === "Note" && (
            <Panel>
              {data.body ? (
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {data.body}
                </Typography>
              ) : (
                <BlankNote>This note has no text yet</BlankNote>
              )}
            </Panel>
          )}
        </Stack>

        <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
          {menuItems}
        </Menu>

        <DocumentFormDialog
          mode="edit"
          open={editDialog.open}
          onClose={editDialog.close}
          form={editForm}
          item={data}
          items={tree.data?.items ?? []}
          playerNames={playerNames}
          seatNames={seatNames}
          seatsError={seats.error}
          treeError={tree.error}
          withText
          onSubmit={(form) => editDialog.target && updateMutation.mutate({ form, ...editDialog.target })}
          pending={updateMutation.isPending}
        />
        {canManageDocuments && <input {...replace.inputProps} />}
        <ReplaceFileDialog {...replace.dialogProps} />
        <DeleteDocumentDialog
          open={deleteDialog.open}
          onClose={deleteDialog.close}
          item={data}
          items={tree.data?.items ?? []}
          onConfirm={() => deleteMutation.mutate()}
          pending={deleteMutation.isPending}
        />
      </Container>
    </PageTransition>
  );
}
