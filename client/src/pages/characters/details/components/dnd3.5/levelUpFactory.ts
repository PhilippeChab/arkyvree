import type React from "react";
import type { ComponentType } from "react";

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

// Each step takes the wizard state it reads as `wizard`; the Add Level and
// Edit Level wizards both hand themselves over.

interface LevelUpHpState {
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
  hpRolling: boolean;
  hpSettled: boolean;
  hpDisplayValue: number | null;
  triggerHpRoll: (hd: number) => void;
  setValue: (key: "selectedHP", value: number | null) => void;
}

interface LevelUpAttributeState {
  attributeData: AttributesData | undefined;
  isLoadingAttributes: boolean;
  attributesError: Error | null;
  selectedAttribute: string | null;
  setValue: (key: "selectedAttribute", value: string | null) => void;
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
  setValue: (key: "selectedFeats", value: Record<string, SelectedFeat[]>) => void;
  handleDeleteFeat: (featId: string, aptitudeId: string) => void;
}

interface LevelUpReviewState extends LevelReviewState {
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
  selectedAttribute: string | null;
  attributeData: AttributesData | undefined;
}

interface SkillPickerState {
  skillData: SkillsData | null | undefined;
  isLoadingSkills: boolean;
  skillsError: Error | null;
  skillPointAllocations: Record<string, number>;
  setValue: (key: "skillPointAllocations", value: Record<string, number>) => void;
  getValues: (key: "skillPointAllocations") => Record<string, number>;
  /** Several levels at once (Add Level): each level's class skills and points. */
  perLevelClassSkillIds?: string[][];
  perLevelSkillPoints?: number[];
}

interface AddClassPlanState {
  classPlan: (SelectedKlass | null)[];
  slotKeys: number[];
  handleClassChange: (index: number, klass: SelectedKlass | null) => void;
  handleAddLevel: () => void;
  handleQuickAddLevel: (klass: SelectedKlass) => void;
  handleRemoveLevel: (index: number) => void;
}

interface AddAttributeState {
  attributeData: AttributesData | undefined;
  isLoadingAttributes: boolean;
  attributesError: Error | null;
  abilityIncreaseLevels: number[];
  abilityIncreases: Record<number, string | null>;
  handleAbilityIncreaseChange: (index: number, abilityId: string) => void;
  levelDetails: Pick<PreviewLevelDetail, "klassName" | "level">[];
}

interface AddReviewState extends LevelReviewState {
  classPlan: (SelectedKlass | null)[];
  hpValues: (number | null)[];
  abilityIncreases: Record<number, string | null>;
  attributeData: AttributesData | undefined;
}

interface AddHpState {
  hpLevels: Array<{ className: string; hd: number; nextLevel: number }>;
  hpValues: (number | null)[];
  handleHpChange: (index: number, value: number | null) => void;
  handleHpRoll: (index: number) => void;
  handleHpRollAll: () => void;
  handleHpMaxAll: () => void;
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
  setValue: (key: "selectedPowers", value: LevelUpFormData["selectedPowers"]) => void;
  handleDeletePower: (powerId: string, aptitudeId: string) => void;
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

export interface LevelUpHpStepProps {
  wizard: LevelUpHpState;
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

/** The skills, feats and spells picked, as every level review lists them. */
export interface LevelReviewState {
  skillPointAllocations: Record<string, number>;
  skillData: SkillsData | null | undefined;
  selectedFeats: LevelUpFormData["selectedFeats"];
  featData: FeatsData | null | undefined;
  selectedPowers: LevelUpFormData["selectedPowers"];
  powerData: PowersData | null | undefined;
}

export interface LevelUpReviewStepProps {
  wizard: LevelUpReviewState;
}

export interface LevelUpSkillsStepProps {
  wizard: SkillPickerState;
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

export interface AddAttributeStepProps {
  wizard: AddAttributeState;
  baseRules: BaseRules;
}

export interface AddReviewStepProps {
  wizard: AddReviewState;
}

export interface AddHpStepProps {
  wizard: AddHpState;
}

export interface LevelUpPowersStepProps {
  wizard: PowerPickerState;
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
