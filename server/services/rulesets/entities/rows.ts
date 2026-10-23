/** A ruleset entity, any kind's, as its page or its list reads it: its row, with the fields it holds, and its last save. */
export interface EntityRow {
  [key: string]: unknown;
  description: string | null;
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
 * What a list reads: every kind's (its search, its own entities alone, its order), and its kind's filters past them, by
 * their query keys (a race's `kind`, a spell's `aptitudeId` and `level`), which its kind's rules read.
 */
export type ListWhere = Record<string, unknown> & {
  childOnly?: boolean;
  orderBy?: "createdAt" | "name" | "updatedAt";
  orderDir?: "asc" | "desc";
  search?: string;
};
