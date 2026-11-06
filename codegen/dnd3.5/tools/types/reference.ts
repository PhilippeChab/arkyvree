/** What 3.5's references hold past what every ruleset's do (the texts they name, what they detect), and its references by type. */

import type { Stored } from "@/codegen/core/references/types.ts";
import type { Modifier, ModifierEffect } from "@/content/core/builders/customization/types.ts";

import type { ClassReference } from "./classes.ts";
import type { DomainReference } from "./domains.ts";
import type { FeatReference } from "./feats.ts";
import type { ItemReference } from "./items.ts";
import type { MagicItemReference } from "./magicItems.ts";
import type { RaceReference } from "./races.ts";
import type { SpellReference } from "./spells.ts";
import type { WizardSchoolReference } from "./wizardSchools.ts";

/**
 * A domain's, a race's or a class feature's detected modifiers, the invalid paths (bugs to fix) and the text that
 * couldn't be parsed (to review). A domain's and a race's have no requirements (`Modifier`): a class feature is a feat,
 * whose modifiers may have some (`ModifierSeed`).
 */
export interface DetectedModifiers<M extends ModifierEffect = Modifier> {
  errors?: string[];
  modifiers: M[];
  unresolvedModifiers?: string[];
}

/** A named piece of text: a race's trait, a class feature's sub-option. */
export interface NamedText {
  description: string;
  name: string;
}

/** Each type of reference, by its name in a reference's `_meta`. */
export interface ReferenceByType {
  class: ClassReference;
  domain: DomainReference;
  feat: FeatReference;
  item: ItemReference;
  magicItem: MagicItemReference;
  race: RaceReference;
  spell: SpellReference;
  wizardSchool: WizardSchoolReference;
}

/** A reference's text checked against the fixed set the seed accepts: the option it is, or why it isn't one. */
export type Checked<T> = { ok: true; value: T } | { ok: false; problem: string };

/** A type of reference, as a reference's `_meta` names it. */
export type ReferenceType = keyof ReferenceByType;

/** A reference as it's stored: what the scraper read, and the corrections made by hand. */
export type StoredReference<T extends ReferenceType = ReferenceType> = Stored<ReferenceByType[T]>;
