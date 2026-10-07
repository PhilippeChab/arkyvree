/**
 * 3.5 character-sheet section prop shapes. These fields (BAB, grapple, AC breakdown with touch/flatfooted/deflection,
 * encumbrance loads, Fortitude/
 * Reflex/Will saves, skill ranks) are D&D 3.5 specific — other rulesets would define their own section prop types
 * alongside their own section components.
 */

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

export interface Dnd35AbilityScoresSectionProps {
  abilities: CharacterDetail["abilities"];
  characterId: string;
  readOnly?: boolean;
}

export interface Dnd35BondedSectionProps {
  bonded: NonNullable<CharacterDetail["bonded"][string]>;
  /** When true, the bonded name renders as a router link to `/characters/<bondedId>`. */
  linkable?: boolean;
}

export interface Dnd35CombatAndSavesSectionProps {
  combat: SheetCombat;
  saves: CharacterDetail["savingThrows"];
}

export interface Dnd35PowersSectionProps {
  aptitudes?: CharacterDetail["aptitudes"];
  classes: CharacterDetail["classes"];
  powers?: CharacterDetail["powers"];
  rulesetId?: string;
  spellTagLists?: CharacterDetail["spellTagLists"];
  spellTags?: CharacterDetail["spellTags"];
  virtualPowers?: CharacterDetail["virtualPowers"];
}

export interface Dnd35SkillsSectionProps {
  skills: NonNullable<CharacterDetail["skills"]>;
}

/** The sheet's combat stats; empty on a sheet that carries none. */
export type SheetCombat = Partial<CharacterDetail["combat"]>;
