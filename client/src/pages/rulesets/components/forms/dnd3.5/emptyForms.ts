/** Each D&D 3.5 entity's form, empty: what its create dialog opens on, and what its edit form holds until it loads. */

import type { ClassFormData } from "./ClassFormFields.tsx";
import type { ItemFormInternal } from "./itemForm.ts";
import type { SkillFormData } from "./SkillFormFields.tsx";
import type { SpellFormData } from "./spellForm.ts";

export const EMPTY_CLASS: ClassFormData = { name: "", description: "", hd: 8 };

export const EMPTY_ITEM: ItemFormInternal = { name: "", description: "", costGp: "", weight: "", isTemplate: false };

export const EMPTY_SKILL: SkillFormData = {
  name: "",
  description: "",
  primaryAbilityId: "",
  impactedByWeight: false,
  checkPenaltyMultiplier: 1,
  usableWithoutTraining: false,
};

export const EMPTY_SPELL: SpellFormData = { name: "", description: "", aptitudes: [] };
