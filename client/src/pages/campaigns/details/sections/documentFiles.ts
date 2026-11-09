/** A document's file's requests: where it's read, and its upload or removal once its form is saved. */

import { parseResponse } from "hono/client";

import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { DocumentFile, DocumentFormData } from "./documents.ts";

/** A document's file's route: its bytes, through the server, to whoever sees the document. */
const fileApi = rpc.api.campaigns[":id"].documents[":documentId"].file;

/**
 * What a save's toast says once a document's own change is in (`saved`: "Document updated"): its file's failure, which
 * leaves the document saved, said with it (`fileError`), or that it saved.
 */
export function describeFileSave(saved: string, fileError: unknown) {
  if (!fileError) return { message: saved, severity: "success" } as const;
  const why = errorMessage(fileError, "Failed to upload the file");
  return { message: `${saved}, but its file didn't save: ${why}`, severity: "warning" } as const;
}

/** Where a document's file is read, its upload time in it: a replaced one is read anew, never from a cache. */
export function toDocumentFileUrl(campaignId: string, documentId: string, file: Pick<DocumentFile, "uploadedAt">) {
  const url = fileApi.$url({ param: { id: campaignId, documentId } });
  url.searchParams.set("v", file.uploadedAt);
  return url.toString();
}

/**
 * Uploads the file a document's form picked (`file`), or removes the one it held (`removeFile`): nothing when it left
 * it. Run by the mutation that saves the form, once the rest is in. Answers why it failed, none when it saved, so the
 * save it follows is said with it.
 */
export async function saveDocumentFileFn(
  campaignId: string,
  documentId: string,
  data: Pick<DocumentFormData, "file" | "removeFile">,
) {
  const param = { id: campaignId, documentId };
  try {
    if (data.file) await parseResponse(fileApi.$put({ param, form: { file: data.file } }));
    else if (data.removeFile) await parseResponse(fileApi.$delete({ param }));
    return null;
  } catch (error) {
    return error;
  }
}
