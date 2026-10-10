/**
 * What a query runs on, the server's and the seeders' alike: the schema with its relations, a connection to the
 * database, or a transaction on it.
 */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

import * as relations from "./relations.ts";
import * as schema from "./schema.ts";

/** A connection to the database, or a transaction on it. */
export type Db = NodePgDatabase<typeof SCHEMA_WITH_RELATIONS> | Transaction;

export type Transaction = PgTransaction<
  PgQueryResultHKT,
  typeof SCHEMA_WITH_RELATIONS,
  ExtractTablesWithRelations<typeof SCHEMA_WITH_RELATIONS>
>;

/** The schema's tables and their relations, which a connection is built on (its `db.query.…`). */
export const SCHEMA_WITH_RELATIONS = { ...schema, ...relations };
