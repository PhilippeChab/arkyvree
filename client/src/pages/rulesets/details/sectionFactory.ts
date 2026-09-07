import type { RPC } from "@/client/src/services/rpc.ts";
import type { InferResponseType } from "hono/client";
import type { ReactNode } from "react";
import { ClassesSection, ItemsSection, SkillsSection, SpellsSection } from "./sections/dnd3.5/index.ts";

type RulesetResponse = InferResponseType<RPC["api"]["rulesets"][":id"]["$get"], 200>;
type BaseRules = RulesetResponse["baseRules"];

export interface SkillsSectionProps {
  ruleset: RulesetResponse;
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

export type ClassesSectionProps = SkillsSectionProps;
export type ItemsSectionProps = SkillsSectionProps;
export type PowersSectionProps = SkillsSectionProps;

type SectionComponent<P extends SkillsSectionProps = SkillsSectionProps> = (props: P) => ReactNode;

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
