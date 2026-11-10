import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState } from "@/client/src/hooks/index.ts";
import { invalidateCampaignDocuments } from "@/client/src/pages/campaigns/details/sectionQueries.ts";

import { replaceDocumentFileFn } from "./documentFiles.ts";
import { type CampaignDocument, describeFileRefusal, DOCUMENT_FILE_ACCEPT, type DocumentFile } from "./documents.ts";

/** A document whose file is replaced, as its confirmation names it: its name, and its file's. */
interface ReplacedDocument extends Pick<CampaignDocument, "id" | "name"> {
  file: Pick<DocumentFile, "name"> | null;
}

/** A replacement waiting on its confirmation: the document, and the file picked for it. */
export interface FileReplacement {
  document: ReplacedDocument;
  file: File;
}

/**
 * Replaces a document's file, of a campaign (`campaignId`), as its own action: `start` opens the file picker for a
 * document, a file it can't take is refused as it's picked, and one it can waits on a confirmation, since the file it
 * replaces is deleted. Its caller renders the picker (`inputProps`, a hidden input) and the confirmation
 * (`dialogProps`, `ReplaceFileDialog`).
 */
export function useReplaceDocumentFile(campaignId: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  // The hidden picker, in state: a document's action hands its click on to it
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<ReplacedDocument | null>(null);
  const dialog = useDialogState<FileReplacement>();

  const mutation = useMutation({
    mutationFn: (replacement: FileReplacement) =>
      replaceDocumentFileFn(campaignId, replacement.document.id, replacement.file),
    onSuccess: () => {
      snackbar.success("File replaced");
      invalidateCampaignDocuments(queryClient, campaignId);
      dialog.close();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to replace file");
      // The document may be gone, deleted meanwhile: the list says so
      invalidateCampaignDocuments(queryClient, campaignId);
    },
  });

  return {
    dialogProps: {
      open: dialog.open,
      onClose: dialog.close,
      // Once, while it's open: a second click as it closes sends no second upload
      onConfirm: () => dialog.open && dialog.target && mutation.mutate(dialog.target),
      pending: mutation.isPending,
      replacement: dialog.target,
    },
    inputProps: {
      ref: setInput,
      type: "file",
      accept: DOCUMENT_FILE_ACCEPT,
      hidden: true,
      "aria-label": "Replace File",
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Reset so picking the same file again fires its change
        event.target.value = "";
        if (!file || !document) return;
        const refusal = describeFileRefusal(file);
        if (refusal) snackbar.warning(refusal);
        else dialog.openWith({ document, file });
      },
    },
    /** Opens the file picker for a document (`target`), whose file the one picked replaces once confirmed. */
    start: (target: ReplacedDocument) => {
      setDocument(target);
      input?.click();
    },
  };
}
