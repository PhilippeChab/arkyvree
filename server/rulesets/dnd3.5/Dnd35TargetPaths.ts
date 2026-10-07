/** The paths an entity's modifiers and requirements name, in the 3.5 rules: each category's, and the ruleset's labels. */

import CategoryPaths from "@/engine/core/paths/CategoryPaths.ts";
import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import { stripSeparators } from "@/shared/text.ts";

import AbilitiesPaths from "./abilities/AbilitiesPaths.ts";
import AptitudesPaths from "./aptitudes/AptitudesPaths.ts";
import BondedPaths from "./bonded/BondedPaths.ts";
import type { Dnd35Components } from "./character/components.ts";
import ClassesPaths from "./classes/ClassesPaths.ts";
import CombatPaths from "./combat/CombatPaths.ts";
import ItemsPaths from "./combat/ItemsPaths.ts";
import WeaponPaths from "./combat/WeaponPaths.ts";
import { UNARMED_STRIKE } from "./constants.ts";
import FeatsPaths from "./feats/FeatsPaths.ts";
import IdentityPaths from "./identity/IdentityPaths.ts";
import PowersPaths from "./powers/PowersPaths.ts";
import SavesPaths from "./saves/SavesPaths.ts";
import SkillsPaths from "./skills/SkillsPaths.ts";
import SpellcastingPaths from "./spellcasting/SpellcastingPaths.ts";

/** The 3.5 rules' categories of target paths, in the path picker's order (`getCategories`). */
const DND35_PATH_CATEGORIES: PathCategory<Dnd35Components>[] = [
  new AbilitiesPaths(),
  new SkillsPaths(),
  new SavesPaths(),
  new CombatPaths(),
  new WeaponPaths(),
  new ItemsPaths(),
  new ClassesPaths(),
  new FeatsPaths(),
  new PowersPaths(),
  new IdentityPaths(),
  new AptitudesPaths(),
  new SpellcastingPaths(),
  new BondedPaths(),
];

export default class Dnd35TargetPaths extends CategoryPaths<Dnd35Components> {
  constructor() {
    super(DND35_PATH_CATEGORIES);
  }

  /** The ruleset's names: its entities', skill families', spell lists', and its properties' values. */
  protected labelNames(rulesetData: RulesetData, segmentLabels: Record<string, string>): Record<string, string> {
    const { abilities, saves, skills, feats, aptitudes, klasses, powers, propertiesByEntityType } = rulesetData;
    // An item is reached by its type or its proficiency, its properties' values below, never by its name
    for (const entity of [...abilities, ...saves, ...skills, ...feats, ...aptitudes, ...klasses, ...powers])
      segmentLabels[stripSeparators(entity.name)] = entity.name;

    Object.assign(segmentLabels, SkillsPaths.getFamilyLabels(skills), {
      [stripSeparators(UNARMED_STRIKE)]: UNARMED_STRIKE,
    });

    // Spell possession slug labels (e.g. "wizard" → "Wizard" for "Wizard Spells" aptitude)
    for (const apt of aptitudes) {
      const slug = toSpellPossessionSlug(apt.name);
      if (!(slug in segmentLabels)) segmentLabels[slug] = apt.name.replace(/ Spells$/, "");
    }

    // Property values (weapon types, armor types, etc.)
    // Skip purely numeric values (e.g. ARMOR_CHECK_PENALTY "-1" → key "1") to avoid
    // clobbering spell level labels
    for (const prop of propertiesByEntityType.get("items") ?? []) {
      const normalized = stripSeparators(prop.value);
      if (normalized && !/^\d+$/.test(normalized)) segmentLabels[normalized] = prop.value;
    }

    // Every family the rules know, listed whether or not a feat of the ruleset is in it
    for (const family of FEAT_FAMILIES) segmentLabels[stripSeparators(family)] ??= family;

    // Feat property values (e.g. "weaponfocus" → "Weapon Focus")
    // For feat families, also add wildcard label (e.g. "weaponfocus*" → "Weapon Focus (Any)")
    for (const prop of propertiesByEntityType.get("feats") ?? []) {
      const normalizedValue = stripSeparators(prop.value);
      if (normalizedValue && !(normalizedValue in segmentLabels)) segmentLabels[normalizedValue] = prop.value;
      if (prop.type === FEAT_FAMILY && normalizedValue) {
        const wildcardKey = `${normalizedValue}*`;
        if (!(wildcardKey in segmentLabels)) segmentLabels[wildcardKey] = `${prop.value} (Any)`;
      }
    }

    // Power property type names (e.g. SPELL_SCHOOL → "Spell School")
    // and power property values (e.g. "evocation" → "Evocation")
    for (const prop of propertiesByEntityType.get("powers") ?? []) {
      if (!(prop.type in segmentLabels)) segmentLabels[prop.type] = formatPropertyType(prop.type);
      const normalizedValue = stripSeparators(prop.value);
      if (normalizedValue && !/^\d+$/.test(normalizedValue) && !(normalizedValue in segmentLabels))
        segmentLabels[normalizedValue] = prop.value;
    }
    return segmentLabels;
  }
}
