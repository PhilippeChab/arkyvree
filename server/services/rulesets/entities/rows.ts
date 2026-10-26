/**
 * A ruleset entity, any kind's, as its page or its list reads it: as stored (its own columns, its links), with its
 * fields as its kind's codec reads them, and its last save.
 */
export interface EntityRow {
  [key: string]: unknown;
  description: string | null;
  fields: Readonly<Record<string, unknown>>;
  id: string;
  name: string;
  rulesetId: string;
  updatedAt: string;
}

/** A page of a list. */
export interface Pagination {
  limit: number;
  page: number;
}

/**
 * What a list reads: every kind's (its search, its own entities alone, its order), and its kind's filters past them,
 * each by the field, the role or the partition it filters (a race's `partition`, a spell's list by its `listedIn` role
 * and its `tier`), which its kind's rules read.
 */
export type ListWhere = Record<string, unknown> & {
  childOnly?: boolean;
  orderBy?: "createdAt" | "name" | "updatedAt";
  orderDir?: "asc" | "desc";
  search?: string;
};
