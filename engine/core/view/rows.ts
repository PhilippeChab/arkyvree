/**
 * The rows the engine reads a ruleset's entities as, each kind's by its module's storage declaration
 * (`StorageEngine.rowOf`): what every kind's row holds, and the registries each module fills with its own kinds' rows
 * (`ViewEntities`), which the view's reads are typed by, and with the kinds an entity of another kind owns
 * (`OwnedEntities`); and an entity's links of a role it holds many of, as the view composes them (`ViewLink`).
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

/** A link as an entity's answer carries it: the view's (`ViewLink`), with its target's name (`toName`). */
export interface NamedLink extends ViewLink {
  toName: string;
}

/**
 * The kinds of the view an entity of another kind owns, by table (3.5's class levels, a class's): every registered
 * module declares its own into it. An owned kind has no rules of its own in its module's contract, its owner's
 * answering for it, and no field names one.
 */
export interface OwnedEntities {}

/**
 * Each kind's row as the view holds it, by its table: every registered module declares its own kinds' into it
 * (`declare module`), which `RulesetData.rows`, `byId` and `find` answer.
 */
export interface ViewEntities {}

/**
 * A link from an entity, of a role it holds many of, as the view composes it (`RulesetData.linksOf`: a feat's pool, a
 * class level's grant): its own id, the entity it's from (`fromId`) and the one it's to (`toId`, of `toType`), the pool
 * it's taken through (`viaId`), its tier and its amount, whether it's free, and its place among its entity's links
 * (`ordinal`).
 */
export interface ViewLink {
  amount: number | null;
  free: boolean;
  fromId: string;
  id: string;
  ordinal: number;
  role: string;
  tier: number | null;
  toId: string;
  toType: string;
  viaId: string | null;
}

/**
 * What every ruleset entity's row holds: its scope, its name and its description, and its timestamps. A mapped type, as
 * a row's answer is plain data any record type takes (an interface isn't).
 */
export type EntityRow = Pick<EntityColumns, keyof EntityColumns>;

/** What a link's row holds: its timestamps (a link is never archived: `deletedAt` is always null). */
export type LinkRow = Pick<EntityRow, "createdAt" | "deletedAt" | "updatedAt">;

/** The kinds of the view an entity of another kind owns (3.5's class levels). */
export type OwnedKind = keyof OwnedEntities;

/** A row as a module's storage declaration reads it: its columns by name. */
export type Row = Record<string, unknown>;

/** The kinds of the view no entity owns: those a module's contract answers of, and a field names. */
export type StandaloneKind = Exclude<keyof ViewEntities, OwnedKind>;
