import { SKILL_NAMES } from "@/database/packages/dnd35/content/skills.ts";
import DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import DetailedCharacterSkills from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";
import DetailedCharacterWeapons from "@/server/rulesets/dnd3.5/DetailedCharacterWeapons.ts";
import DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import DetailedCharacterIdentity from "@/server/rulesets/universal/DetailedCharacterIdentity.ts";
import DetailedCharacterSavingThrows from "@/server/rulesets/universal/DetailedCharacterSavingThrows.ts";

// The engine's own target paths, so the parser's checks stay in step with the app: its components, given stub
// abilities, saves and skills.

const ABILITY_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const SAVE_NAMES = ["Fortitude", "Reflex", "Will"];
const stubAbilities = ABILITY_NAMES.map((name) => ({ name })) as Parameters<
  typeof DetailedCharacterAbilities.generateTargetPaths
>[0];
const stubSaves = SAVE_NAMES.map((name) => ({ name })) as Parameters<
  typeof DetailedCharacterSavingThrows.generateTargetPaths
>[0];
const stubSkills = SKILL_NAMES.map((name) => ({ name })) as Parameters<
  typeof DetailedCharacterSkills.generateTargetPaths
>[0];

/** Every target path of `kind` the engine knows. */
export function buildValidPaths(kind: "modifier" | "requirement"): Set<string> {
  return new Set(
    [
      ...DetailedCharacterAbilities.generateTargetPaths(stubAbilities, kind),
      ...DetailedCharacterCombat.generateTargetPaths(kind),
      ...DetailedCharacterWeapons.generateItemWeaponPaths(kind),
      ...DetailedCharacterSavingThrows.generateTargetPaths(stubSaves, kind),
      ...DetailedCharacterSkills.generateTargetPaths(stubSkills, kind),
      ...DetailedCharacterIdentity.generateTargetPaths(kind),
    ].map((tp) => tp.path),
  );
}
