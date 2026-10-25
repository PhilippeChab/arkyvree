/**
 * The entities a ruleset's view holds, each as stored (`ViewEntity`: its own columns, its own fields by field, its
 * single links by role), the registries each module fills with its own kinds (`ViewKinds`), which the view's reads are
 * typed by, and with the kinds an entity of another kind owns (`OwnedKinds`); and an entity's links as the view composes
 * them (`ViewLink`).
 */

import type { EntityRecord, FieldValue } from "@/engine/core/module/index.ts";

/** A link as an entity's answer carries it: the view's (`ViewLink`), with its target's name (`toName`). */
export interface NamedLink extends ViewLink {
  toName: string;
}

/**
 * The kinds of the view an entity of another kind owns, by table (3.5's class levels, a class's): every registered
 * module declares its own into it. An owned kind has no rules of its own in its module's contract, its owner's
 * answering for it, and no field names one.
 */
export interface OwnedKinds {}

/**
 * Each kind's entity as the view holds it, by its table (a `ViewEntity`, its own fields and single links typed): every
 * registered module declares its own kinds' into it (`declare module`), which `RulesetData.rows`, `byId` and `find`
 * answer.
 */
export interface ViewKinds {}

/**
 * A link from an entity, as the view composes it (`RulesetData.linksOf`: a feat's pool, a class level's grant, an
 * item's template): its own id, the entity it's from (`fromId`) and the one it's to (`toId`, of `toType`), the pool
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

/** The kinds of the view an entity of another kind owns (3.5's class levels). */
export type OwnedKind = keyof OwnedKinds;

/** The kinds of the view no entity owns: those a module's contract answers of, and a field names. */
export type StandaloneKind = Exclude<keyof ViewKinds, OwnedKind>;

/**
 * An entity as the view holds it: its record as stored (`EntityRecord`), its own fields' values by field (`F`, typed as
 * its kind holds them) and its single links' targets by role (of `L`, its kind's roles), each the entity the view shows
 * for it (its copy's, its winner's); a standalone kind's named.
 */
export type ViewEntity<F extends object = Readonly<Record<string, FieldValue>>, L extends string = string> = Omit<
  EntityRecord,
  "fields" | "links" | "name"
> & { fields: Readonly<F>; links: Readonly<Partial<Record<L, string>>>; name: string };
