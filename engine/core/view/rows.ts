/**
 * The entities a ruleset's view holds, each as stored (`ViewEntity`: its own columns, its fields by field, its single
 * links by role), the registry each module declares its own kinds into (`ModuleKinds`: each kind's entity typed as its
 * module holds it, and the kinds an entity of another kind owns), which a module's code reads its kinds by
 * (`DeclaredRows`) and names a kind by (`KindType`, `OwnedKind`, `StandaloneKind`); and an entity's links as the view
 * composes them (`ViewLink`).
 */

import type { EntityRecord, OwnerFields } from "@/engine/core/module/index.ts";

/**
 * Each registered module's kinds, by the module's name (3.5's `dnd3.5`), as it declares them (`declare module`): each
 * kind's entity as the view holds it, by its type (`rows`: a `ViewEntity`, the fields its rules read by name and its
 * single links typed), and the types of those an entity of another kind owns (`owned`: 3.5's class levels, a class's).
 * An owned kind has no rules of its own in its module's contract, its owner's answering for it, and no field names one.
 * Each module's kinds are its own, so two modules may each declare a kind of one type (`feats`) with rows of their own:
 * a module's code reads its kinds as it declares them (`DeclaredRows`), and the engine's machinery as the view holds
 * any kind's (`RulesetData`, each a `ViewEntity`).
 */
export interface ModuleKinds {}

/** A link as an entity's answer carries it: the view's (`ViewLink`), with its target's name (`toName`). */
export interface NamedLink extends ViewLink {
  toName: string;
}

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

/**
 * A module's kinds' entities, by their types (`V`, its `ModuleKinds` entry's `rows`), each as the view holds it: a
 * standalone kind's named (a `ViewEntity`), an owned kind's maybe not (3.5's class level, named by its position).
 */
export type KindRows<V> = { [K in keyof V]: Omit<ViewEntity, "name"> & { name: string | null } };

/** A kind of the view, by its type, of any registered module (3.5's `feats`, its `class-levels`). */
export type KindType = { [M in keyof ModuleKinds]: keyof ModuleKinds[M]["rows"] & string }[keyof ModuleKinds];

/** The kinds of the view an entity of another kind owns, of any registered module (3.5's class levels). */
export type OwnedKind = ModuleKinds[keyof ModuleKinds]["owned"];

/**
 * The kinds of the view no entity owns, of any registered module: those a module's contract answers of, and a field
 * names.
 */
export type StandaloneKind = {
  [M in keyof ModuleKinds]: Exclude<keyof ModuleKinds[M]["rows"] & string, ModuleKinds[M]["owned"]>;
}[keyof ModuleKinds];

/**
 * An entity as the view holds it: its record as stored (`EntityRecord`), every field it holds by field, its sibling
 * copies' merged in (`OwnerFields`, those its rules read by name typed as its kind holds them: `F`), and its single
 * links' targets by role (of `L`, its kind's roles), each the entity the view shows for it (its copy's, its winner's); a
 * standalone kind's named.
 */
export type ViewEntity<F extends object = OwnerFields, L extends string = string> = Omit<
  EntityRecord,
  "fields" | "links" | "name"
> & { fields: OwnerFields & Readonly<F>; links: Readonly<Partial<Record<L, string>>>; name: string };

/** Any kind's entities, by their types, as the view holds them: what code that names no module's kinds reads. */
export type ViewRows = KindRows<Record<string, unknown>>;
