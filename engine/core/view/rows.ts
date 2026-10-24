/**
 * The rows the engine reads a ruleset's entities as, each kind's by its module's storage declaration
 * (`StorageEngine.rowOf`, `joinRowsOf`): what every kind's row holds, and the registries each module fills with its own
 * kinds' and joins' rows (`ViewEntities`, `ViewJoins`), which the view's reads are typed by, and with the kinds an
 * entity of another kind owns (`OwnedEntities`).
 */

/** An entity's own columns. */
interface EntityColumns {
  campaignId: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  id: string;
  name: string;
  rulesetId: string;
  updatedAt: string;
}

/**
 * The kinds of the view an entity of another kind owns, by table (3.5's class levels, a class's): every registered
 * module declares its own into it. An owned kind has no rules of its own in its module's contract, its owner's answering
 * for it, and no field names one.
 */
export interface OwnedEntities {}

/**
 * Each kind's row as the view holds it, by its table: every registered module declares its own kinds' into it
 * (`declare module`), which `RulesetData.rows`, `byId` and `find` answer.
 */
export interface ViewEntities {}

/** Each join's row as the view holds it, by its name: every registered module declares its own joins' into it. */
export interface ViewJoins {}

/**
 * What every ruleset entity's row holds: its scope, its name and its description, and its timestamps. A mapped type, as
 * a row's answer is plain data any record type takes (an interface isn't).
 */
export type EntityRow = Pick<EntityColumns, keyof EntityColumns>;

/** What a link's row holds: its timestamps (a link is never archived: `deletedAt` is always null). */
export type LinkRow = Pick<EntityRow, "createdAt" | "deletedAt" | "updatedAt">;

/** A row as a module's storage declaration reads it: its columns by name. */
export type Row = Record<string, unknown>;

/** The kinds of the view no entity owns: those a module's contract answers of, and a field names. */
export type StandaloneKind = Exclude<keyof ViewEntities, keyof OwnedEntities>;
