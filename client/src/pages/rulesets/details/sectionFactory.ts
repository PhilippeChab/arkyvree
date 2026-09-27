import type { RPC } from "@/client/src/services/rpc.ts";
import type { InferResponseType } from "hono/client";
import type { ReactNode } from "react";
import { ClassesSection, ItemsSection, SkillsSection, SpellsSection } from "./sections/dnd3.5/index.ts";

type RulesetResponse = InferResponseType<RPC["api"]["rulesets"][":id"]["$get"], 200>;
type BaseRules = RulesetResponse["baseRules"];

/** What the ruleset page passes every section tab. */
export interface RulesetSectionProps {
  ruleset: RulesetResponse;
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

export type ClassesSectionProps = RulesetSectionProps;
export type ItemsSectionProps = RulesetSectionProps;
export type PowersSectionProps = RulesetSectionProps;
export type SkillsSectionProps = RulesetSectionProps;

type SectionComponent<P extends RulesetSectionProps = RulesetSectionProps> = (props: P) => ReactNode;

interface SectionMap {
  ClassesSection: SectionComponent;
  ItemsSection: SectionComponent;
  PowersSection: SectionComponent;
  SkillsSection: SectionComponent;
  labels: {
    powers: string;
  };
}

const rulesetSections: Record<BaseRules, SectionMap> = {
  "Dungeons & Dragons: 3.5": {
    ClassesSection,
    ItemsSection,
    PowersSection: SpellsSection,
    SkillsSection,
    labels: {
      powers: "Spells",
    },
  },
};

export function getSections(baseRules: BaseRules): SectionMap {
  return rulesetSections[baseRules];
}
