/**
 * Each step takes the wizard state it reads as `wizard`; the Add Level and Edit Level wizards both hand themselves
 * over.
 */

import type React from "react";
import type { ComponentType } from "react";
import type { Control } from "react-hook-form";

import { AddAttributeStep } from "./AddAttributeStep.tsx";
import { AddClassPlanStep } from "./AddClassPlanStep.tsx";
import { AddHpStep } from "./AddHpStep.tsx";
import { AddReviewStep } from "./AddReviewStep.tsx";
import type {
  AptitudePool,
  AttributesData,
  AvailableKlass,
  AvailablePower,
  BaseRules,
  FeatsData,
  GroupedFeatRow,
  LevelUpFormData,
  PowersData,
  PreviewLevelDetail,
  SelectedFeat,
  SelectedKlass,
  SkillsData,
} from "./levelUp/index.ts";
import { LevelUpAttributeStep } from "./LevelUpAttributeStep.tsx";
import { LevelUpFeatsStep } from "./LevelUpFeatsStep.tsx";
import { LevelUpHpStep } from "./LevelUpHpStep.tsx";
import { LevelUpReviewStep } from "./LevelUpReviewStep.tsx";
import { LevelUpSkillsStep } from "./LevelUpSkillsStep.tsx";
import { LevelUpSpellsStep } from "./LevelUpSpellsStep.tsx";

interface AddAttributeState {
  attributeData: AttributesData | undefined;
  isLoadingAttributes: boolean;
  attributesError: Error | null;
  abilityIncreaseLevels: number[];
  abilityIncreases: Record<number, string | null>;
  handleAbilityIncreaseChange: (index: number, abilityId: string) => void;
  levelDetails: Pick<PreviewLevelDetail, "klassName" | "level">[];
}

interface AddClassPlanState {
  classPlan: (SelectedKlass | null)[];
  slotKeys: number[];
  handleClassChange: (index: number, klass: SelectedKlass | null) => void;
  handleAddLevel: () => void;
  handleQuickAddLevel: (klass: SelectedKlass) => void;
  handleRemoveLevel: (index: number) => void;
}

interface AddHpState {
  hpLevels: Array<{ className: string; hd: number; nextLevel: number }>;
  hpValues: (number | null)[];
  handleHpChange: (index: number, value: number | null) => void;
  handleHpRoll: (index: number) => void;
  handleHpRollAll: () => void;
  handleHpMaxAll: () => void;
}

interface AddReviewState extends LevelReviewState {
  classPlan: (SelectedKlass | null)[];
  hpValues: (number | null)[];
  abilityIncreases: Record<number, string | null>;
  attributeData: AttributesData | undefined;
}

/** The feat picker state a level wizard hands the Feats step. */
interface FeatPickerState {
  featData: FeatsData | null | undefined;
  isLoadingFeats: boolean;
  featsError: Error | null;
  adjustedFeatPools: Record<string, AptitudePool>;
  selectedFeats: Record<string, SelectedFeat[]>;
  selectedAptitude: string | null;
  setSelectedAptitude: (aptitude: string | null) => void;
  groupedFeats: GroupedFeatRow[];
  isLoadingAvailableFeats: boolean;
  isFetchingNextFeatsPage: boolean;
  expandedFeatFamilies: ReadonlySet<string>;
  toggleFeatFamily: (family: string) => void;
  allSelectedFeatPickString?: string;
  featSearch: string;
  setFeatSearch: (search: string) => void;
  handleFeatsScroll: (event: React.UIEvent<HTMLElement>) => void;
  /** The picks' form: the feats field, which the step changes from `selectedFeats`. */
  control: Control<LevelUpFormData>;
}

interface LevelUpAttributeState {
  attributeData: AttributesData | undefined;
  isLoadingAttributes: boolean;
  attributesError: Error | null;
  /** The picks' form: the attribute field. */
  control: Control<LevelUpFormData>;
}

interface LevelUpHpState {
  selectedClass: SelectedKlass | null;
  /** The picks' form: the HP field. */
  control: Control<LevelUpFormData>;
  hpRolling: boolean;
  hpSettled: boolean;
  hpDisplayValue: number | null;
  triggerHpRoll: (hd: number) => void;
}

interface LevelUpReviewState extends LevelReviewState {
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
  selectedAttribute: string | null;
  attributeData: AttributesData | undefined;
}

/** The spell picker state a level wizard hands the Spells step. */
interface PowerPickerState {
  powerData: PowersData | null | undefined;
  isLoadingPowers: boolean;
  powersError: Error | null;
  selectedPowers: LevelUpFormData["selectedPowers"];
  selectedFeats: LevelUpFormData["selectedFeats"];
  selectedPowerAptitude: string | null;
  selectedPowerLevel: number | null;
  setSelectedPowerAptitude: (aptitude: string | null) => void;
  setSelectedPowerLevel: (level: number | null) => void;
  availablePowers: AvailablePower[];
  isLoadingAvailablePowers: boolean;
  isFetchingNextPowersPage: boolean;
  powerSearch: string;
  /** The picks' form: the spells field, which the step changes from `selectedPowers`. */
  control: Control<LevelUpFormData>;
  setPowerSearch: (search: string) => void;
  handlePowersScroll: (event: React.UIEvent<HTMLElement>) => void;
}

interface SectionMap {
  LevelUpHpStep: ComponentType<LevelUpHpStepProps>;
  LevelUpAttributeStep: ComponentType<LevelUpAttributeStepProps>;
  LevelUpSkillsStep: ComponentType<LevelUpSkillsStepProps>;
  LevelUpFeatsStep: ComponentType<LevelUpFeatsStepProps>;
  LevelUpPowersStep: ComponentType<LevelUpPowersStepProps>;
  LevelUpReviewStep: ComponentType<LevelUpReviewStepProps>;
  AddClassPlanStep: ComponentType<AddClassPlanStepProps>;
  AddHpStep: ComponentType<AddHpStepProps>;
  AddAttributeStep: ComponentType<AddAttributeStepProps>;
  AddReviewStep: ComponentType<AddReviewStepProps>;
}

interface SkillPickerState {
  skillData: SkillsData | null | undefined;
  isLoadingSkills: boolean;
  skillsError: Error | null;
  /** The points as they fit the slots */
  skillPointAllocations: Record<string, number>;
  /** The picks' form: the skill points field, which the step changes from `skillPointAllocations`. */
  control: Control<LevelUpFormData>;
  /** Several levels at once (Add Level): each level's class skills and points. */
  perLevelClassSkillIds?: string[][];
  perLevelSkillPoints?: number[];
}

export interface AddAttributeStepProps {
  wizard: AddAttributeState;
  baseRules: BaseRules;
}

export interface AddClassPlanStepProps {
  wizard: AddClassPlanState;
  /** Search-filtered list for the Autocomplete dropdown. */
  availableKlasses: AvailableKlass[];
  /** Unfiltered snapshot for the quick-add button row so searching doesn't
   *  drop the character's existing classes from the "+ X" row. */
  quickAddKlasses: AvailableKlass[];
  isLoadingKlasses: boolean;
  handleKlassListScroll: (event: React.UIEvent<HTMLElement>) => void;
  setKlassSearch: (search: string) => void;
}

export interface AddHpStepProps {
  wizard: AddHpState;
}

export interface AddReviewStepProps {
  wizard: AddReviewState;
}

/** The skills, feats and spells picked, as every level review lists them. */
export interface LevelReviewState {
  skillPointAllocations: Record<string, number>;
  skillData: SkillsData | null | undefined;
  selectedFeats: LevelUpFormData["selectedFeats"];
  featData: FeatsData | null | undefined;
  selectedPowers: LevelUpFormData["selectedPowers"];
  powerData: PowersData | null | undefined;
}

export interface LevelUpAttributeStepProps {
  wizard: LevelUpAttributeState;
  baseRules: BaseRules;
}

export interface LevelUpFeatsStepProps {
  wizard: FeatPickerState;
  characterId: string;
  /** The class and level the next pick lands on, for the feat detail's prerequisites. */
  klassId: string;
  klassLevel: number;
  editingLevelId?: string;
  pendingLevelKlassLevelIds?: string;
  pendingLevelFeatPicks?: string;
}

export interface LevelUpHpStepProps {
  wizard: LevelUpHpState;
}

export interface LevelUpPowersStepProps {
  wizard: PowerPickerState;
}

export interface LevelUpReviewStepProps {
  wizard: LevelUpReviewState;
}

export interface LevelUpSkillsStepProps {
  wizard: SkillPickerState;
}

const rulesetSections: Record<BaseRules, SectionMap> = {
  "Dungeons & Dragons: 3.5": {
    LevelUpHpStep,
    LevelUpAttributeStep,
    LevelUpSkillsStep,
    LevelUpFeatsStep,
    LevelUpPowersStep: LevelUpSpellsStep,
    LevelUpReviewStep,
    AddClassPlanStep,
    AddHpStep,
    AddAttributeStep,
    AddReviewStep,
  },
};

export function getLevelUpSections(baseRules: BaseRules): SectionMap {
  return rulesetSections[baseRules];
}
