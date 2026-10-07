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

import { ABILITY_NAMES } from "@/database/packages/dnd35-from-parser/tools/vocabulary/abilities.ts";
import { SAVE_NAMES } from "@/database/packages/dnd35-from-parser/tools/vocabulary/saves.ts";

const stubAbilities = ABILITY_NAMES.map((name) => ({ name })) as Parameters<
  typeof AbilitiesPaths.generateAbilityPaths
>[0];
const stubSaves = SAVE_NAMES.map((name) => ({ name })) as Parameters<typeof SavesPaths.generateSavePaths>[0];
const stubSkills = SKILL_NAMES.map((name) => ({ name })) as Parameters<typeof SkillsPaths.generateSkillPaths>[0];

/** Every target path of `kind` the engine knows. */
export function buildValidPaths(kind: "modifier" | "requirement"): Set<string> {
  return new Set(
    [
      ...AbilitiesPaths.generateAbilityPaths(stubAbilities, kind),
      ...CombatPaths.generateCombatPaths(kind),
      ...WeaponPaths.generateItemWeaponPaths(kind),
      ...SavesPaths.generateSavePaths(stubSaves, kind),
      ...SkillsPaths.generateSkillPaths(stubSkills, kind),
      ...IdentityPaths.generateIdentityPaths(kind),
    ].map((tp) => tp.path),
  );
}
