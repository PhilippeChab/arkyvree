import { Container, Menu, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import {
  ActionMenuItem,
  BlankNote,
  DetailPageHeader,
  PageError,
  PageLoader,
  PageTransition,
  Panel,
  StatusChip,
} from "@/client/src/components/common/index.ts";
import { DeleteIcon, EditIcon, VisibilityIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, useDialogState, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { campaignDetailQuery, campaignDocumentQuery } from "./campaignQueries.ts";
import { campaignDocumentsQuery, campaignSeatsQuery, invalidateCampaignDocuments } from "./details/sectionQueries.ts";
import {
  DeleteDocumentDialog,
  describeAudience,
  type DocumentFormData,
  DocumentFormDialog,
  EMPTY_DOCUMENT_FORM,
  readSeatNames,
  toDocumentEdit,
  toEditForm,
} from "./details/sections/index.ts";
import { useCampaignPermissions } from "./hooks/index.ts";

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
          json: { ...toDocumentEdit(form, opened, true), updatedAt },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Document updated");
      invalidateCampaignDocuments(queryClient, campaignId);
      editDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to update document"),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.campaigns[":id"].documents[":documentId"].$delete({ param: { id: campaignId, documentId } }),
      ),
    onSuccess: () => {
      snackbar.success("Document deleted");
      invalidateCampaignDocuments(queryClient, campaignId);
      navigate(documentsTab(campaignId, data?.parentId ?? null));
      // Gone: don't let Back render it from the cache
      queryClient.removeQueries({ queryKey: QUERY_KEYS.campaigns.documentDetail(campaignId, documentId) });
    },
    onError: (error) => snackbar.error(error, "Failed to delete document"),
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
          <Panel>
            {data.body ? (
              <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {data.body}
              </Typography>
            ) : (
              <BlankNote>This document has no text yet</BlankNote>
            )}
          </Panel>
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
