/** A document's file's requests: where it's read, and its replacement once an edit's form is saved. */

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

/** A text file's words, read through the server as its document's page shows them: UTF-8, as its upload checked. */
export async function readDocumentTextFn(campaignId: string, documentId: string) {
  const file = await (await fileApi.$get({ param: { id: campaignId, documentId } })).blob();
  return await file.text();
}

/**
 * Uploads the file an edit's form picked to replace a document's (`file`): nothing when it kept it. Run by the mutation
 * that saves the form, once the rest is in. Answers why it failed, none when it saved, so the save it follows is said
 * with it.
 */
export async function saveDocumentFileFn(campaignId: string, documentId: string, data: Pick<DocumentFormData, "file">) {
  if (!data.file) return null;
  try {
    await parseResponse(fileApi.$put({ param: { id: campaignId, documentId }, form: { file: data.file } }));
    return null;
  } catch (error) {
    return error;
  }
}
