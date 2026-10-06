export type ContentTable = (typeof CONTENT_TABLES)[number];

/** The tables scoped by their ruleset_id, compared field by field. */
export const CONTENT_TABLES = [
  "abilities",
  "aptitudes",
  "feats",
  "items",
  "klasses",
  "languages",
  "mechanics",
  "powers",
  "races",
  "saves",
  "skills",
] as const;
