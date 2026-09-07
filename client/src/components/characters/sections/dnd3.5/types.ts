/**
 * 3.5 character-sheet section prop shapes. These fields (BAB, grapple, AC
 * breakdown with touch/flatfooted/deflection, encumbrance loads, Fortitude/
 * Reflex/Will saves, skill ranks) are D&D 3.5 specific — other rulesets would
 * define their own section prop types alongside their own section components.
 */
import type { RPC } from "@/client/src/services/rpc.ts";
import type { InferResponseType } from "hono/client";

type CharacterResponse = InferResponseType<RPC["api"]["characters"][":id"]["$get"], 200>;

export interface Dnd35CombatAndSavesSectionProps {
  combat: {
    hp?: { base?: number; constitution?: number; misc?: number; total?: number };
    initiative?: { dexterity?: number; misc?: number; total?: number };
    speed?: { base?: number; misc?: number; total?: number };
    bab?: number;
    grapple?: { bab?: number; strength?: number; size?: number; misc?: number; total?: number };
    ac?: {
      total?: number;
      touch?: number;
      flatfooted?: number;
      base?: number;
      armor?: number;
      shield?: number;
      dexterity?: number;
      natural?: number;
      deflection?: number;
      misc?: number;
    };
    encumbrance?: {
      carriedweight?: number;
      lightload?: number;
      mediumload?: number;
      heavyload?: number;
      load?: string;
    };
  };
  saves: Record<string, {
    name?: string;
    base?: number;
    ability?: number;
    misc?: number;
    total?: number;
  }>;
}

export interface Dnd35PowersSectionProps {
  classes: CharacterResponse["classes"];
  powers?: CharacterResponse["powers"];
  virtualPowers?: CharacterResponse["virtualPowers"];
  aptitudes?: CharacterResponse["aptitudes"];
  spellTags?: CharacterResponse["spellTags"];
  rulesetId?: string;
}

export interface Dnd35AbilityScoresSectionProps {
  abilities: Record<string, {
    abilityId?: string;
    base?: number;
    level?: number;
    misc?: number;
    total?: number;
  }>;
  characterId: string;
  readOnly?: boolean;
}

export interface Dnd35SkillsSectionProps {
  skills: NonNullable<CharacterResponse["skills"]>;
}
