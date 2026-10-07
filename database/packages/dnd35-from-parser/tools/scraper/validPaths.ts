/**
 * The engine's own target paths, so the parser's checks stay in step with the app: its categories' lists, given stub
 * abilities, saves and skills.
 */

import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
import AbilitiesPaths from "@/server/rulesets/dnd3.5/abilities/AbilitiesPaths.ts";
import CombatPaths from "@/server/rulesets/dnd3.5/combat/CombatPaths.ts";
import WeaponPaths from "@/server/rulesets/dnd3.5/combat/WeaponPaths.ts";
import IdentityPaths from "@/server/rulesets/dnd3.5/identity/IdentityPaths.ts";
import SavesPaths from "@/server/rulesets/dnd3.5/saves/SavesPaths.ts";
import SkillsPaths from "@/server/rulesets/dnd3.5/skills/SkillsPaths.ts";

const ABILITY_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const SAVE_NAMES = ["Fortitude", "Reflex", "Will"];
const stubAbilities = ABILITY_NAMES.map((name) => ({ name })) as Parameters<
  typeof AbilitiesPaths.generateTargetPaths
>[0];
const stubSaves = SAVE_NAMES.map((name) => ({ name })) as Parameters<typeof SavesPaths.generateTargetPaths>[0];
const stubSkills = SKILL_NAMES.map((name) => ({ name })) as Parameters<typeof SkillsPaths.generateTargetPaths>[0];

/** Every target path of `kind` the engine knows. */
export function buildValidPaths(kind: "modifier" | "requirement"): Set<string> {
  return new Set(
    [
      ...AbilitiesPaths.generateTargetPaths(stubAbilities, kind),
      ...CombatPaths.generateCombatPaths(kind),
      ...WeaponPaths.generateItemWeaponPaths(kind),
      ...SavesPaths.generateTargetPaths(stubSaves, kind),
      ...SkillsPaths.generateTargetPaths(stubSkills, kind),
      ...IdentityPaths.generateTargetPaths(kind),
    ].map((tp) => tp.path),
  );
}
