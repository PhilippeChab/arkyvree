import { count, eq, getTableColumns, type InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { documentsInCampaign } from "@/drizzle/schema.ts";
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

  /** How many folders and documents a campaign keeps. */
  async count(db: Db, where: { campaignId: string }) {
    const [result] = await db
      .select({ count: count() })
      .from(this.table)
      .where(eq(this.table.campaignId, where.campaignId));
    return result?.count ?? 0;
  }

  async create(db: Db, values: InferInsertModel<typeof documentsInCampaign>) {
    return (await db.insert(this.table).values(values).returning()).map(toDocument);
  }

  /** Deletes a folder, with what it holds, or a document: the database cascades to its contents and their readers. */
  async delete(db: Db, where: { id: string }) {
    return (await db.delete(this.table).where(eq(this.table.id, where.id)).returning()).map(toDocument);
  }

  /** A campaign's whole tree, its documents' text left out, each by its name, then its id. */
  async findMany(db: Db, where: { campaignId: string }) {
    const rows = await db
      .select(TREE_COLUMNS)
      .from(this.table)
      .where(eq(this.table.campaignId, where.campaignId))
      .orderBy(this.orderBy(this.table.name), this.orderBy(this.table.id));
    return rows.map(toDocument);
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
