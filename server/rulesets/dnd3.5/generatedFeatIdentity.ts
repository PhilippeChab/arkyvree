import type { GeneratedFeatIdentity } from "@/shared/rulesets/generatedFeats.ts";
import { stripSeparators } from "@/shared/utils.ts";

const weaponFamilies = new Set([
  "Weapon Focus", "Greater Weapon Focus", "Weapon Specialization", "Greater Weapon Specialization",
  "Improved Critical", "Simple Weapon Proficiency", "Martial Weapon Proficiency", "Exotic Weapon Proficiency", "Rapid Reload",
]);

/** Content-import boundary only. Runtime edits retain this identity instead of re-inferring it. */
export function generatedFeatIdentity(name: string, skillsByName: ReadonlyMap<string, string>): GeneratedFeatIdentity | null {
  const separator = name.indexOf(": ");
  if (separator === -1) return null;
  const family = name.slice(0, separator);
  const label = name.slice(separator + 2);
  if (family === "Skill Focus") {
    const key = skillsByName.get(label);
    return key ? { kind: "skills", key, label, family } : null;
  }
  if (family === "Spell Focus" || family === "Greater Spell Focus") return { kind: "SPELL_SCHOOL", key: stripSeparators(label), label, family };
  if (weaponFamilies.has(family)) return { kind: "WEAPON_TYPE", key: stripSeparators(label), label, family };
  return null;
}
