/** Import DetailedCharacter components that generate paths */

import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import AptitudesComponent from "@/server/rulesets/dnd3.5/aptitudes/AptitudesComponent.ts";
import BondsComponent from "@/server/rulesets/dnd3.5/bonded/BondsComponent.ts";
import ClassesComponent from "@/server/rulesets/dnd3.5/classes/ClassesComponent.ts";
import ArmorsComponent from "@/server/rulesets/dnd3.5/combat/ArmorsComponent.ts";
import CombatComponent from "@/server/rulesets/dnd3.5/combat/CombatComponent.ts";
import EncumbranceComponent from "@/server/rulesets/dnd3.5/combat/EncumbranceComponent.ts";
import ShieldsComponent from "@/server/rulesets/dnd3.5/combat/ShieldsComponent.ts";
import WeaponsComponent from "@/server/rulesets/dnd3.5/combat/WeaponsComponent.ts";
import { UNARMED_STRIKE } from "@/server/rulesets/dnd3.5/constants.ts";
import FeatGroupingsComponent from "@/server/rulesets/dnd3.5/feats/FeatGroupingsComponent.ts";
import FeatsComponent from "@/server/rulesets/dnd3.5/feats/FeatsComponent.ts";
import IdentityComponent from "@/server/rulesets/dnd3.5/identity/IdentityComponent.ts";
import PowerGroupingsComponent from "@/server/rulesets/dnd3.5/powers/PowerGroupingsComponent.ts";
import PowersComponent from "@/server/rulesets/dnd3.5/powers/PowersComponent.ts";
import SavingThrowsComponent from "@/server/rulesets/dnd3.5/saves/SavingThrowsComponent.ts";
import SkillsComponent from "@/server/rulesets/dnd3.5/skills/SkillsComponent.ts";
import CategoryPaths from "@/server/rulesets/engine/paths/CategoryPaths.ts";
import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import type { TargetPathsInterface } from "@/server/rulesets/engine/types.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import {
  ARMOR_TYPE,
  FEAT_FAMILY,
  SHIELD_TYPE,
  SPELL_DESCRIPTOR,
  SPELL_SCHOOL,
  WEAPON_PROFICIENCY,
  WEAPON_TYPE,
} from "@/shared/dnd3.5/properties/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import { stripSeparators } from "@/shared/text.ts";

import AbilitiesPaths from "./abilities/AbilitiesPaths.ts";
import AptitudesPaths from "./aptitudes/AptitudesPaths.ts";
import BondedPaths from "./bonded/BondedPaths.ts";
import ClassesPaths from "./classes/ClassesPaths.ts";
import CombatPaths from "./combat/CombatPaths.ts";
import ItemsPaths from "./combat/ItemsPaths.ts";
import WeaponPaths from "./combat/WeaponPaths.ts";
import FeatsPaths from "./feats/FeatsPaths.ts";
import IdentityPaths from "./identity/IdentityPaths.ts";
import { Dnd35LevelsHooks } from "./levels/LevelsHooks.ts";
import PowersPaths from "./powers/PowersPaths.ts";
import SavesPaths from "./saves/SavesPaths.ts";
import SkillsPaths from "./skills/SkillsPaths.ts";
import SpellcastingPaths from "./spellcasting/SpellcastingPaths.ts";
import { collectClassListIds, collectFeatListIds } from "./spellcasting/spellLists.ts";

/** The 3.5 rules' categories of target paths, in the path picker's order (`getCategories`). */
const DND35_PATH_CATEGORIES: PathCategory[] = [
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

/**
 * The groupings the ruleset's properties and powers define, which the paths are generated for: weapons by type
 * (e.g. "longsword") and proficiency category (e.g. "exotic"), each armor and shield type, spell schools and
 * descriptors (wildcard DC paths), each leveled power (flat DC paths), and feat families with their display names.
 */
function collectGroupings(rulesetData: RulesetData) {
  const { powers, propertiesByEntityType } = rulesetData;
  const itemProperties = propertiesByEntityType.get("items") ?? [];
  const powerProperties = propertiesByEntityType.get("powers") ?? [];
  const featProperties = propertiesByEntityType.get("feats") ?? [];

  // Every family the rules know, a feat of the ruleset in it or not: an extension's checks of another book's
  const featGroupingLabels: Record<string, string> = Object.fromEntries(
    FEAT_FAMILIES.map((family) => [stripSeparators(family), family]),
  );
  for (const prop of featProperties) {
    if (prop.type === FEAT_FAMILY) featGroupingLabels[stripSeparators(prop.value)] = prop.value;
  }

  // The leveled aptitudes: those with spells at a level, and those a class gives slots in before they have any
  const leveledAptitudeIds = collectClassListIds(rulesetData);
  for (const power of powers) {
    for (const pa of power.powersAptitudesInRules) {
      if (pa.level != null) leveledAptitudeIds.add(pa.aptitudeId);
    }
  }

  return {
    powersWithProperties: powers.map((power) => ({
      ...power,
      properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
    })),
    // Every character strikes unarmed, without an item: its grouping is always there
    weaponGroupings: [
      ...new Set([
        stripSeparators(UNARMED_STRIKE),
        ...slugsOf(itemProperties, WEAPON_TYPE),
        ...slugsOf(itemProperties, WEAPON_PROFICIENCY),
      ]),
    ],
    armorGroupings: slugsOf(itemProperties, ARMOR_TYPE),
    shieldGroupings: slugsOf(itemProperties, SHIELD_TYPE),
    schoolGroupings: slugsOf(powerProperties, SPELL_SCHOOL),
    descriptorGroupings: slugsOf(powerProperties, SPELL_DESCRIPTOR),
    individualPowerDcNames: [
      ...new Set(
        powers
          .filter((p) => p.powersAptitudesInRules.some((pa) => pa.level != null))
          .map((p) => stripSeparators(p.name)),
      ),
    ],
    featGroupings: Object.keys(featGroupingLabels),
    featGroupingLabels,
    leveledAptitudeIds,
  };
}

/** Every target path, from the DetailedCharacter components' static generators, and the requirement-only spellcasting. */
function generatePaths(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
  const { abilities, saves, skills, feats, aptitudes, klasses } = rulesetData;
  const groupings = collectGroupings(rulesetData);
  const paths: TargetPath[] = [
    ...SkillsComponent.generateTargetPaths(skills, kind),
    ...ClassesComponent.generateTargetPaths(klasses, kind),
    ...FeatsComponent.generateTargetPaths(feats, kind),
    ...FeatGroupingsComponent.generateTargetPaths(
      groupings.featGroupings,
      kind,
      groupings.featGroupingLabels,
      new Set(feats.map((feat) => stripSeparators(feat.name))),
    ),
    ...WeaponsComponent.generateTargetPaths(groupings.weaponGroupings, kind),
    ...ArmorsComponent.generateTargetPaths(groupings.armorGroupings, kind),
    ...ShieldsComponent.generateTargetPaths(groupings.shieldGroupings, kind),
    ...PowersComponent.generateTargetPaths(
      groupings.powersWithProperties,
      aptitudes,
      collectFeatListIds(rulesetData),
      kind,
    ),
    ...PowerGroupingsComponent.generateTargetPaths(groupings.schoolGroupings, kind, true, "school"),
    ...PowerGroupingsComponent.generateTargetPaths(groupings.descriptorGroupings, kind, true, "descriptor"),
    ...PowerGroupingsComponent.generateTargetPaths(groupings.individualPowerDcNames, kind, false),
    ...AptitudesComponent.generateTargetPaths(
      aptitudes,
      kind,
      groupings.leveledAptitudeIds,
      Dnd35LevelsHooks.MAX_SPELL_LEVEL,
    ),
    ...CombatComponent.generateTargetPaths(kind),
    ...WeaponsComponent.generateItemWeaponPaths(kind),
    ...EncumbranceComponent.generateTargetPaths(kind),
    ...AbilitiesComponent.generateTargetPaths(abilities, kind),
    ...SavingThrowsComponent.generateTargetPaths(saves, kind),
    ...IdentityComponent.generateTargetPaths(kind),
    ...BondsComponent.generateTargetPaths(kind),
  ];

  if (kind === "requirement") {
    const numericOps = [
      "equal",
      "not_equal",
      "greater_than",
      "less_than",
      "greater_than_or_equal",
      "less_than_or_equal",
    ];
    paths.push(
      {
        path: "spellcasting.arcane",
        category: "spellcasting",
        description: "Max arcane spell level castable",
        valueType: "number",
        operators: numericOps,
      },
      {
        path: "spellcasting.divine",
        category: "spellcasting",
        description: "Max divine spell level castable",
        valueType: "number",
        operators: numericOps,
      },
    );
  }
  return paths;
}

/** Each path segment's display label: the categories', the components' structural ones, and the ruleset's names. */
function segmentLabelsOf(rulesetData: RulesetData): Record<string, string> {
  const { abilities, saves, skills, feats, items, aptitudes, klasses, powers, propertiesByEntityType } = rulesetData;
  const segmentLabels: Record<string, string> = {
    "*": "All",
    ...Object.fromEntries(DND35_PATH_CATEGORIES.map(({ name, label }) => [name, label])),
    ...AbilitiesComponent.getSegmentLabels(),
    ...SavingThrowsComponent.getSegmentLabels(),
    ...SkillsComponent.getSegmentLabels(),
    ...ClassesComponent.getSegmentLabels(),
    ...FeatsComponent.getSegmentLabels(),
    ...FeatGroupingsComponent.getSegmentLabels(),
    ...PowersComponent.getSegmentLabels(),
    ...PowerGroupingsComponent.getSegmentLabels(),
    ...AptitudesComponent.getSegmentLabels(),
    ...CombatComponent.getSegmentLabels(),
    ...EncumbranceComponent.getSegmentLabels(),
    ...WeaponsComponent.getSegmentLabels(),
    ...ArmorsComponent.getSegmentLabels(),
    ...ShieldsComponent.getSegmentLabels(),
    ...IdentityComponent.getSegmentLabels(),
    ...BondsComponent.getSegmentLabels(),
    // D&D 3.5 surfaces power groupings as schools in the path picker.
    groups: "Schools",
  };

  for (const entity of [...abilities, ...saves, ...skills, ...feats, ...items, ...aptitudes, ...klasses, ...powers]) {
    segmentLabels[stripSeparators(entity.name)] = entity.name;
  }
  Object.assign(segmentLabels, SkillsComponent.getFamilyLabels(skills), {
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
    if (normalizedValue && !/^\d+$/.test(normalizedValue) && !(normalizedValue in segmentLabels)) {
      segmentLabels[normalizedValue] = prop.value;
    }
  }
  return segmentLabels;
}

/** The distinct slugs of the properties' values of `type`. */
function slugsOf(properties: { type: string; value: string }[], type: string) {
  return [...new Set(properties.filter((p) => p.type === type).map((p) => stripSeparators(p.value)))];
}

export default class Dnd35TargetPaths extends CategoryPaths implements TargetPathsInterface {
  constructor() {
    super(DND35_PATH_CATEGORIES);
  }

  async getTargetPathsAndLabels(
    rulesetData: RulesetData,
    kind: "modifier" | "requirement",
  ): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }> {
    return { paths: generatePaths(rulesetData, kind), segmentLabels: segmentLabelsOf(rulesetData) };
  }
}
