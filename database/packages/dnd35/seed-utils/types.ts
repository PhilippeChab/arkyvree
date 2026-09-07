import type { RequirementEntry } from "@/database/packages/dnd35/v1/feats/types.ts";

export type ClassContext = {
  rulesetId: string;
  saveMap: Record<string, string>;
  skillMap: Record<string, string>;
  featMap: Record<string, string>;
  aptMap: Record<string, string>;
  abilityMap: Record<string, string>;
};

export type BabType = "good" | "medium" | "poor";
export type SaveType = "good" | "poor";

export type ClassSeed = {
  name: string;
  description: string;
  hd: number;
  levels: number;
  skillPoints: number;
  bab: BabType;
  saves: { fortitude: SaveType; reflex: SaveType; will: SaveType };
  classSkills: string[];
  kind?: string;
  requirements?: RequirementEntry[];

  classFeatureAptitude?: string;
  classFeatures?: [number, string][];
  proficiencies?: string[];
  freeFeats?: [number, string, string][];
  aptitudePicks?: { levels: number[]; target: string }[];
  modifiers?: { level: number; target: string; value: string; valueType: string; operator: string }[];

  bonusSpellAbility?: string;
  casterType?: "Arcane" | "Divine";

  spells?: {
    slug: string;
    perDay: number[][];
    known?: number[][];
    knowAll?: boolean;
    noCantrips?: boolean;
  };

  casterLevelAdvancement?: {
    type: "divine" | "arcane" | "any" | "dual";
    levels: number[];
  };

};

export interface SeedPowersContext {
  aptMap: Record<string, string>;
  saveMap: Record<string, string>;
}
