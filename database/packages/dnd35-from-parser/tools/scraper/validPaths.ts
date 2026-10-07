/**
 * The engine's own target paths, so the parser's checks stay in step with the app: its components, given stub
 * abilities, saves and skills.
 */

import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
import AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import CombatComponent from "@/server/rulesets/dnd3.5/combat/CombatComponent.ts";
import WeaponsComponent from "@/server/rulesets/dnd3.5/combat/WeaponsComponent.ts";
import IdentityComponent from "@/server/rulesets/dnd3.5/identity/IdentityComponent.ts";
import SavingThrowsComponent from "@/server/rulesets/dnd3.5/saves/SavingThrowsComponent.ts";
import SkillsComponent from "@/server/rulesets/dnd3.5/skills/SkillsComponent.ts";

const ABILITY_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const SAVE_NAMES = ["Fortitude", "Reflex", "Will"];
const stubAbilities = ABILITY_NAMES.map((name) => ({ name })) as Parameters<
  typeof AbilitiesComponent.generateTargetPaths
>[0];
const stubSaves = SAVE_NAMES.map((name) => ({ name })) as Parameters<
  typeof SavingThrowsComponent.generateTargetPaths
>[0];
const stubSkills = SKILL_NAMES.map((name) => ({ name })) as Parameters<typeof SkillsComponent.generateTargetPaths>[0];

/** Every target path of `kind` the engine knows. */
export function buildValidPaths(kind: "modifier" | "requirement"): Set<string> {
  return new Set(
    [
      ...AbilitiesComponent.generateTargetPaths(stubAbilities, kind),
      ...CombatComponent.generateTargetPaths(kind),
      ...WeaponsComponent.generateItemWeaponPaths(kind),
      ...SavingThrowsComponent.generateTargetPaths(stubSaves, kind),
      ...SkillsComponent.generateTargetPaths(stubSkills, kind),
      ...IdentityComponent.generateTargetPaths(kind),
    ].map((tp) => tp.path),
  );
}
