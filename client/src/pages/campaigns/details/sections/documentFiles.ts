/** A document's file's requests: where it's read, and its replacement. */

import { parseResponse } from "hono/client";

import { rpc } from "@/client/src/services/rpc.ts";

import type { DocumentFile } from "./documents.ts";

/** A document's file's route: its bytes, through the server, to whoever sees the document. */
const fileApi = rpc.api.campaigns[":id"].documents[":documentId"].file;

/** Replaces a document's file with another (`file`), which its Game Master picked and confirmed. */
export function replaceDocumentFileFn(campaignId: string, documentId: string, file: File) {
  return parseResponse(fileApi.$put({ param: { id: campaignId, documentId }, form: { file } }));
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
