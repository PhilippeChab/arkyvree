/**
 * What a `describe*` operation answers in a shape every ruleset shares: a character's card, how a new one's ability
 * scores are set, an inventory entry with its item, a placement's warning, a wizard's steps. What a ruleset describes
 * in its own shape is its `Descriptions` (`contract.ts`).
 */

import type { Item, Modifier, Property, Requirement } from "@/shared/relations.ts";

import type { InventoryEntryPlan } from "./plans.ts";

/** A character's card, as a list of characters shows it: its race, its classes at their highest level, its total. */
export interface CharacterCard {
  levels: { klass: string; level: number }[];
  race: string;
  totalLevel: number;
}

/**
 * How a new character's ability scores are set: the ways its form offers (`methods`), the scores' bounds and the one
 * an ability shows before it's rolled or set (`scores`), and each score's modifier over those bounds (`modifiers`).
 */
export interface CharacterCreation {
  methods: CreationMethod[];
  modifiers: Record<number, number>;
  scores: { max: number; min: number; start: number };
}

/**
 * A way a new character's ability scores are set, which its form runs by its kind: rolled (`dice`: `count` dice of
 * `sides`, the highest `keep` summed), taken from an array (`scores`, each to one ability), or bought (`costs`, each
 * score's from `min` to `max`, out of `budget`).
 */
export type CreationMethod = { id: string; label: string } & (
  | { dice: { count: number; keep: number; sides: number }; kind: "roll" }
  | { kind: "array"; scores: readonly number[] }
  | { budget: number; costs: Readonly<Record<number, number>>; kind: "pointBuy"; max: number; min: number }
);

/**
 * A character's inventory entry, as its sheet lists it: the entry, what its ruleset shows of it (`X`: where its item
 * can go, where it's worn), and its item as the view composes it.
 */
export type DescribedInventoryEntry<T, X = unknown> = T &
  X & {
    item: Item & { modifiers: Modifier[]; properties: Property[]; requirements: Requirement[] };
  };

/** An inventory entry, as where it's held reads it: whether it's equipped, where, and its weapon set in a hand. */
export type HeldInventoryEntry = Pick<InventoryEntryPlan, "equipped" | "location" | "weaponSet">;

/** Why a placement can't take one more item, if it can't: what the inventory dialogs warn of, and an add refuses. */
export interface PlacementDescription {
  warning: string | null;
}

/** A level-up wizard's step, as its ruleset lists it: its name, which the ruleset answers the step by, and its label. */
export interface WizardStep<N extends string = string> {
  label: string;
  name: N;
}
