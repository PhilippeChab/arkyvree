import { and, eq, getTableColumns, type InferInsertModel, isNull, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { documentReadersInCampaign, documentsInCampaign, playersInCampaign } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import type { DocumentKind, DocumentVisibility } from "@/shared/campaignDocuments.ts";

/** A document's row, its kind and visibility ones their columns' checks hold. */
type Document<T> = {
  [K in keyof T]: K extends "kind" ? DocumentKind : K extends "visibility" ? DocumentVisibility : T[K];
};

/** A row's columns but its text, which a tree's read leaves out. */
const { body: _body, ...TREE_COLUMNS } = getTableColumns(documentsInCampaign);

/** A row as its columns' checks type it: every row a read or a write answers goes through it. */
function toDocument<T extends { kind: string; visibility: string }>(row: T): Document<T> {
  return row as Document<T>;
}

class DocumentsRepository extends include(BaseRepository<typeof documentsInCampaign>, GuardsStaleEdits) {
  constructor() {
    super(documentsInCampaign);
  }

  async create(db: Db, values: InferInsertModel<typeof documentsInCampaign>) {
    return (await db.insert(this.table).values(values).returning()).map(toDocument);
  }

  /** Deletes a folder, with what it holds, or a document: the database cascades to its contents and their readers. */
  async delete(db: Db, where: { id: string }) {
    return (await db.delete(this.table).where(eq(this.table.id, where.id)).returning()).map(toDocument);
  }

  /** A folder or a document, of a campaign or any, with its text. */
  async findOne(db: Db, where: { id: string } | { campaignId: string; id: string }) {
    const [row] = await db
      .select()
      .from(this.table)
      .where(
        this.branchWhere(
          [eq(this.table.id, where.id)],
          ["campaignId" in where && eq(this.table.campaignId, where.campaignId)],
        ),
      );
    return row && toDocument(row);
  }

  /**
   * A campaign's whole tree, each by its name, then its id, with the live seats it names (`readerIds`, sorted: a seat
   * archived with its user's account names no one), in one statement, so a write committing meanwhile is read whole or
   * not at all. Its documents' text is left out but one's (`textOf`), which an item's read shows.
   */
  async findTree(db: Db, where: { campaignId: string }, textOf?: string) {
    const readers = documentReadersInCampaign;
    const seat = playersInCampaign;
    const readerIds = sql<string[]>`coalesce(
      array_agg(${readers.playerId}::text ORDER BY ${readers.playerId}::text) FILTER (WHERE ${seat.id} IS NOT NULL),
      '{}'
    )`;
    const body = textOf
      ? sql<string | null>`CASE WHEN ${this.table.id} = ${textOf} THEN ${this.table.body} END`
      : sql<null>`NULL`;
    const rows = await db
      .select({ ...TREE_COLUMNS, body, readerIds })
      .from(this.table)
      .leftJoin(readers, eq(readers.documentId, this.table.id))
      .leftJoin(seat, and(eq(seat.id, readers.playerId), isNull(seat.deletedAt)))
      .where(eq(this.table.campaignId, where.campaignId))
      .groupBy(this.table.id)
      .orderBy(this.orderBy(this.table.name), this.orderBy(this.table.id));
    return rows.map(toDocument);
  }

  /** Changes a row, as its edit read it (`expectedUpdatedAt`): none when it changed since. */
  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof documentsInCampaign>>,
    where: { expectedUpdatedAt?: string; id: string },
  ) {
    const rows = await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(this.where([eq(this.table.id, where.id), this.casUpdatedAt(where.expectedUpdatedAt)]))
      .returning();
    return rows.map(toDocument);
  }
}

export default DocumentsRepository;
