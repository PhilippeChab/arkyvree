import type { Db } from "@/drizzle/database.ts";
import { DocumentReaders, Documents } from "@/server/repositories/index.ts";
import type { DocumentNode } from "@/shared/campaignDocuments.ts";

/** A folder or a document of a campaign's tree, as its read answers it, with the seats it names (`readerIds`). */
export type TreeItem = Awaited<ReturnType<typeof Documents.findMany>>[number] & DocumentNode;

/**
 * A campaign's tree (`campaignId`), read whole (a campaign keeps a few hundred items at most): its folders and documents
 * by id, by their name, then their id, each with the seats it names. A write reads it under its campaign's lock.
 */
export async function readDocumentTree(db: Db, campaignId: string): Promise<Map<string, TreeItem>> {
  const rows = await Documents.findMany(db, { campaignId });
  const readers = await DocumentReaders.findMany(db, { campaignId });
  const readerIds = new Map<string, string[]>();
  for (const { documentId, playerId } of readers)
    readerIds.set(documentId, [...(readerIds.get(documentId) ?? []), playerId]);
  return new Map(rows.map((row) => [row.id, { ...row, readerIds: readerIds.get(row.id) ?? [] }]));
}
