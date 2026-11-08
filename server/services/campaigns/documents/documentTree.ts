import type { Db } from "@/drizzle/database.ts";
import { Documents } from "@/server/repositories/index.ts";
import type { DocumentNode } from "@/shared/campaignDocuments.ts";

/**
 * A folder or a document of a campaign's tree, as its read answers it: the live seats it names (`readerIds`), and its
 * text where the read asked for it (`body`, none otherwise).
 */
export type TreeItem = Awaited<ReturnType<typeof Documents.findTree>>[number] & DocumentNode;

/**
 * A campaign's tree (`campaignId`), read whole in one statement (a campaign keeps a few hundred items at most): its
 * folders and documents by id, by their name, then their id, with one's text (`textOf`). A write reads it under its
 * campaign's lock.
 */
export async function readDocumentTree(db: Db, campaignId: string, textOf?: string): Promise<Map<string, TreeItem>> {
  const rows = await Documents.findTree(db, { campaignId }, textOf);
  return new Map(rows.map((row) => [row.id, row]));
}
