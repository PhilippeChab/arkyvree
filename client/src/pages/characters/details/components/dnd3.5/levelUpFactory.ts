import type { RPC } from "@/client/src/services/rpc.ts";
import type React from "react";
import type { ComponentType } from "react";
import type { InferResponseType } from "hono/client";
import type {
  AptitudePool,
  AvailableKlass,
  BaseRules,
  LevelUpFormData,
  SelectedFeat,
  SelectedKlass,
} from "./levelUp/useLevelWizard.ts";
import {
  LevelUpSkillsStep,
  LevelUpSpellsStep,
  LevelUpHpStep,
  LevelUpAttributeStep,
  LevelUpFeatsStep,
  LevelUpReviewStep,
  AddClassPlanStep,
  AddHpStep,
  AddAttributeStep,
  AddReviewStep,
} from "./index.ts";

type LeveledUpSkillsResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["skill-slots"]["$get"]
>;
type SkillsData = Exclude<LeveledUpSkillsResponse, { error: string }>;

type LeveledUpPowersResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["power-slots"]["$get"]
>;
type PowersData = Exclude<LeveledUpPowersResponse, { error: string }>;

type LeveledUpAttributesResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["attribute-slots"]["$get"]
>;
type AttributesData = Exclude<LeveledUpAttributesResponse, { error: string }>;

type LeveledUpFeatsResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["feat-slots"]["$get"]
>;
type FeatsData = Exclude<LeveledUpFeatsResponse, { error: string }>;

// ── Step prop interfaces ──────────────────────────────────────────────

export interface LevelUpHpStepProps {
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
  isEditing: boolean;
  hpRolling: boolean;
  hpSettled: boolean;
  hpDisplayValue: number | null;
  triggerHpRoll: (hd: number) => void;
  setValue: (key: "selectedHP", value: number | null) => void;
}

export interface LevelUpAttributeStepProps {
  attributeData: AttributesData | undefined;
  isLoadingAttributes: boolean;
  attributesError: Error | null;
  selectedAttribute: string | null;
  baseRules: BaseRules;
  setValue: (key: "selectedAttribute", value: string | null) => void;
}

export interface LevelUpFeatsStepProps {
  featData: FeatsData | null | undefined;
  isLoadingFeats: boolean;
  featsError: Error | null;
  adjustedFeatPools: Record<string, AptitudePool>;
  selectedFeats: Record<string, SelectedFeat[]>;
  selectedAptitude: string | null;
  setSelectedAptitude: (aptitude: string | null) => void;
  groupedFeats: Array<{
    family: string | null;
    displayName: string;
    variantCount: number;
    representativeId: string;
    eligible: boolean;
    aptitudeModifiers?: Array<{
      aptitudeId: string;
      value: number;
      operator: string;
    }>;
  }>;
  isLoadingAvailableFeats: boolean;
  isFetchingNextFeatsPage: boolean;
  expandedFeatFamilies: Set<string>;
  toggleFeatFamily: (family: string) => void;
  characterId: string;
  klassId: string;
  klassLevel: number;
  editingLevelId?: string;
  allSelectedFeatPickString?: string;
  pendingLevelKlassLevelIds?: string;
  pendingLevelFeatPicks?: string;
  featSearch: string;
  setFeatSearch: (search: string) => void;
  handleFeatsScroll: (event: React.UIEvent<HTMLElement>) => void;
  setValue: (
    key: "selectedFeats",
    value: Record<string, SelectedFeat[]>,
  ) => void;
  handleDeleteFeat: (featId: string, aptitudeId: string) => void;
}

export interface LevelUpReviewStepProps {
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
  selectedAttribute: string | null;
  attributeData: AttributesData | undefined;
  skillPointAllocations: Record<string, number>;
  skillData: SkillsData | null | undefined;
  selectedFeats: LevelUpFormData["selectedFeats"];
  featData: FeatsData | null | undefined;
  selectedPowers: LevelUpFormData["selectedPowers"];
  powerData: PowersData | null | undefined;
}

export interface LevelUpSkillsStepProps {
  skillData: SkillsData | null | undefined;
  isLoadingSkills: boolean;
  skillsError: Error | null;
  skillPointAllocations: Record<string, number>;
  setValue: (key: "skillPointAllocations", value: Record<string, number>) => void;
  perLevelClassSkillIds?: string[][];
  perLevelSkillPoints?: number[];
}

export interface AddClassPlanStepProps {
  levels: (SelectedKlass | null)[];
  slotKeys: number[];
  /** Search-filtered list for the Autocomplete dropdown. */
  availableKlasses: AvailableKlass[];
  /** Unfiltered snapshot for the quick-add button row so searching doesn't
   *  drop the character's existing classes from the "+ X" row. */
  quickAddKlasses: AvailableKlass[];
  isLoadingKlasses: boolean;
  onClassChange: (index: number, klass: SelectedKlass | null) => void;
  onAddLevel: () => void;
  onQuickAddLevel: (klass: SelectedKlass) => void;
  onRemoveLevel: (index: number) => void;
  handleKlassListScroll: (event: React.UIEvent<HTMLElement>) => void;
  setKlassSearch: (search: string) => void;
}

export interface AddAttributeStepProps {
  attributeData: AttributesData | undefined;
  isLoadingAttributes: boolean;
  attributesError: Error | null;
  abilityIncreaseLevels: number[];
  abilityIncreases: Record<number, string | null>;
  onAbilityIncreaseChange: (index: number, abilityId: string) => void;
  levelDetails: Array<{ klassName: string; level: number }>;
  baseRules: BaseRules;
}

export interface AddReviewStepProps {
  classPlan: (SelectedKlass | null)[];
  hpValues: (number | null)[];
  abilityIncreases: Record<number, string | null>;
  attributeData: AttributesData | undefined;
  skillPointAllocations: Record<string, number>;
  skillData: SkillsData | null | undefined;
  selectedFeats: LevelUpFormData["selectedFeats"];
  featData: FeatsData | null | undefined;
  selectedPowers: LevelUpFormData["selectedPowers"];
  powerData: PowersData | null | undefined;
}

export interface AddHpStepProps {
  levels: Array<{ className: string; hd: number; nextLevel: number }>;
  hpValues: (number | null)[];
  onHpChange: (index: number, value: number | null) => void;
  onRoll: (index: number) => void;
  onRollAll: () => void;
  onMaxAll: () => void;
}

export interface LevelUpPowersStepProps {
  powerData: PowersData | null | undefined;
  isLoadingPowers: boolean;
  powersError: Error | null;
  selectedPowers: LevelUpFormData["selectedPowers"];
  selectedFeats: Record<string, Array<{ id: string; name: string }>>;
  selectedPowerAptitude: string | null;
  selectedPowerLevel: number | null;
  setSelectedPowerAptitude: (aptitude: string | null) => void;
  setSelectedPowerLevel: (level: number | null) => void;
  availablePowers: Array<{ id: string; name: string; description?: string | null; eligible: boolean }>;
  isLoadingAvailablePowers: boolean;
  isFetchingNextPowersPage: boolean;
  powerSearch: string;
  setValue: (
    key: "selectedPowers",
    value: LevelUpFormData["selectedPowers"],
  ) => void;
  handleDeletePower: (powerId: string, aptitudeId: string) => void;
  onPowerSearchChange: (value: string) => void;
  onPowersScroll: (event: React.UIEvent<HTMLElement>) => void;
}

// ── Section map ───────────────────────────────────────────────────────

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
