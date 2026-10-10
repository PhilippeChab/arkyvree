/** Each D&D 3.5 entity's form, empty: what its create dialog opens on, and what its edit form holds until it loads. */

import type { ClassFormData } from "./ClassFormFields.tsx";
import type { ClassLevelFormData } from "./classLevelForm.ts";
import type { ItemFormData } from "./itemForm.ts";
import type { SkillFormData } from "./SkillFormFields.tsx";
import type { SpellFormData } from "./spellForm.ts";

export const EMPTY_CLASS: ClassFormData = { name: "", description: "", hd: 8 };

export const EMPTY_CLASS_LEVEL: ClassLevelFormData = { level: 1, fields: { bab: 0, skills: 1 }, saves: [], feats: [] };

export const EMPTY_ITEM: ItemFormData = {
  name: "",
  description: "",
  costGp: "",
  weight: "",
  type: "",
  slot: "",
  isTemplate: false,
  sourceItemId: "",
};

export const EMPTY_SKILL: SkillFormData = {
  name: "",
  description: "",
  primaryAbilityId: "",
  fields: { impactedByWeight: false, checkPenaltyMultiplier: 1, usableWithoutTraining: false },
};

export const EMPTY_SPELL: SpellFormData = {
  name: "",
  description: "",
  saveId: "",
  saveEffect: "",
  fields: {
    school: "",
    subschool: "",
    descriptors: [],
    castingTime: "",
    rangeType: "",
    target: "",
    areaOfEffect: "",
    duration: "",
    spellResistance: "",
    components: [],
  },
  aptitudes: [],
};
