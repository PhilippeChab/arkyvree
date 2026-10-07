/**
 * Each step takes the wizard state it reads as `wizard`; the Add Level and Edit Level wizards both hand themselves
 * over.
 */

import { type ComponentType, type UIEvent } from "react";
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
  abilityIncreaseLevels: number[];
  abilityIncreases: Record<number, string | null>;
  attributeData: AttributesData | undefined;
  attributesError: Error | null;
  handleAbilityIncreaseChange: (index: number, abilityId: string) => void;
  isLoadingAttributes: boolean;
  levelDetails: Pick<PreviewLevelDetail, "klassName" | "level">[];
}

interface AddClassPlanState {
  classPlan: (SelectedKlass | null)[];
  handleAddLevel: () => void;
  handleClassChange: (index: number, klass: SelectedKlass | null) => void;
  handleQuickAddLevel: (klass: SelectedKlass) => void;
  handleRemoveLevel: (index: number) => void;
  slotKeys: number[];
}

interface AddHpState {
  handleHpChange: (index: number, value: number | null) => void;
  handleHpMaxAll: () => void;
  handleHpRoll: (index: number) => void;
  handleHpRollAll: () => void;
  hpLevels: Array<{ className: string; hd: number; nextLevel: number }>;
  hpValues: (number | null)[];
}

interface AddReviewState extends LevelReviewState {
  abilityIncreases: Record<number, string | null>;
  attributeData: AttributesData | undefined;
  classPlan: (SelectedKlass | null)[];
  hpValues: (number | null)[];
}

/** The feat picker state a level wizard hands the Feats step. */
interface FeatPickerState {
  adjustedFeatPools: Record<string, AptitudePool>;
  allSelectedFeatPickString?: string;
  /** Why the feats to pick didn't load. */
  availableFeatsError: unknown;
  /** The picks' form: the feats field, which the step changes from `selectedFeats`. */
  control: Control<LevelUpFormData>;
  expandedFeatFamilies: ReadonlySet<string>;
  featData: FeatsData | null | undefined;
  featSearch: string;
  featsError: Error | null;
  groupedFeats: GroupedFeatRow[];
  handleFeatsScroll: (event: UIEvent<HTMLElement>) => void;
  isFetchingNextFeatsPage: boolean;
  isLoadingAvailableFeats: boolean;
  isLoadingFeats: boolean;
  selectedAptitude: string | null;
  selectedFeats: Record<string, SelectedFeat[]>;
  setFeatSearch: (search: string) => void;
  setSelectedAptitude: (aptitude: string | null) => void;
  toggleFeatFamily: (family: string) => void;
}

interface LevelUpAttributeState {
  attributeData: AttributesData | undefined;
  attributesError: Error | null;
  /** The picks' form: the attribute field. */
  control: Control<LevelUpFormData>;
  isLoadingAttributes: boolean;
}

interface LevelUpHpState {
  /** The picks' form: the HP field. */
  control: Control<LevelUpFormData>;
  hpDisplayValue: number | null;
  hpRolling: boolean;
  hpSettled: boolean;
  selectedClass: SelectedKlass | null;
  triggerHpRoll: (hd: number) => void;
}

interface LevelUpReviewState extends LevelReviewState {
  attributeData: AttributesData | undefined;
  selectedAttribute: string | null;
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
}

/** The spell picker state a level wizard hands the Spells step. */
interface PowerPickerState {
  availablePowers: AvailablePower[];
  /** Why the spells to pick didn't load. */
  availablePowersError: unknown;
  /** The picks' form: the spells field, which the step changes from `selectedPowers`. */
  control: Control<LevelUpFormData>;
  handlePowersScroll: (event: UIEvent<HTMLElement>) => void;
  isFetchingNextPowersPage: boolean;
  isLoadingAvailablePowers: boolean;
  isLoadingPowers: boolean;
  powerData: PowersData | null | undefined;
  powerSearch: string;
  powersError: Error | null;
  selectedFeats: LevelUpFormData["selectedFeats"];
  selectedPowerAptitude: string | null;
  selectedPowerLevel: number | null;
  selectedPowers: LevelUpFormData["selectedPowers"];
  setPowerSearch: (search: string) => void;
  setSelectedPowerAptitude: (aptitude: string | null) => void;
  setSelectedPowerLevel: (level: number | null) => void;
}

interface SectionMap {
  AddAttributeStep: ComponentType<AddAttributeStepProps>;
  AddClassPlanStep: ComponentType<AddClassPlanStepProps>;
  AddHpStep: ComponentType<AddHpStepProps>;
  AddReviewStep: ComponentType<AddReviewStepProps>;
  LevelUpAttributeStep: ComponentType<LevelUpAttributeStepProps>;
  LevelUpFeatsStep: ComponentType<LevelUpFeatsStepProps>;
  LevelUpHpStep: ComponentType<LevelUpHpStepProps>;
  LevelUpPowersStep: ComponentType<LevelUpPowersStepProps>;
  LevelUpReviewStep: ComponentType<LevelUpReviewStepProps>;
  LevelUpSkillsStep: ComponentType<LevelUpSkillsStepProps>;
}

interface SkillPickerState {
  /** The picks' form: the skill points field, which the step changes from `skillPointAllocations`. */
  control: Control<LevelUpFormData>;
  isLoadingSkills: boolean;
  /** Several levels at once (Add Level): each level's class skills and points. */
  perLevelClassSkillIds?: string[][];
  perLevelSkillPoints?: number[];
  skillData: SkillsData | null | undefined;
  /** The points as they fit the slots */
  skillPointAllocations: Record<string, number>;
  skillsError: Error | null;
}

export interface AddAttributeStepProps {
  baseRules: BaseRules;
  wizard: AddAttributeState;
}

export interface AddClassPlanStepProps {
  /** Search-filtered list for the Autocomplete dropdown. */
  availableKlasses: AvailableKlass[];
  handleKlassListScroll: (event: UIEvent<HTMLElement>) => void;
  isLoadingKlasses: boolean;
  /** Why the classes didn't load, said where they'd show. */
  klassesError: unknown;
  /** Unfiltered snapshot for the quick-add button row so searching doesn't
   *  drop the character's existing classes from the "+ X" row. */
  quickAddKlasses: AvailableKlass[];
  setKlassSearch: (search: string) => void;
  wizard: AddClassPlanState;
}

export interface AddHpStepProps {
  wizard: AddHpState;
}

export interface AddReviewStepProps {
  wizard: AddReviewState;
}

/** The skills, feats and spells picked, as every level review lists them. */
export interface LevelReviewState {
  featData: FeatsData | null | undefined;
  powerData: PowersData | null | undefined;
  selectedFeats: LevelUpFormData["selectedFeats"];
  selectedPowers: LevelUpFormData["selectedPowers"];
  skillData: SkillsData | null | undefined;
  skillPointAllocations: Record<string, number>;
}

export interface LevelUpAttributeStepProps {
  baseRules: BaseRules;
  wizard: LevelUpAttributeState;
}

export interface LevelUpFeatsStepProps {
  characterId: string;
  editingLevelId?: string;
  /** The class and level the next pick lands on, for the feat detail's prerequisites. */
  klassId: string;
  klassLevel: number;
  pendingLevelFeatPicks?: string;
  pendingLevelKlassLevelIds?: string;
  wizard: FeatPickerState;
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

const RULESET_SECTIONS: Record<BaseRules, SectionMap> = {
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
  return RULESET_SECTIONS[baseRules];
}
