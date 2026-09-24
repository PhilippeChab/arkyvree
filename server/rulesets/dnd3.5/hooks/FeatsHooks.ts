import type { FeatsHooks } from "@/server/rulesets/hooks/FeatsHooks.ts";

// These families use generated "Family: source" names in the content packages
// and runtime generators. Keep their names stable; their source controls naming.
const GENERATED_FAMILIES = new Set([
  "Skill Focus", "Spell Focus", "Greater Spell Focus",
  "Weapon Focus", "Greater Weapon Focus", "Weapon Specialization", "Greater Weapon Specialization",
  "Improved Critical", "Simple Weapon Proficiency", "Martial Weapon Proficiency", "Exotic Weapon Proficiency",
  "Rapid Reload", "Favored Enemy",
]);

export class Dnd35FeatsHooks implements FeatsHooks {
  isGeneratedName(name: string): boolean {
    const separator = name.indexOf(": ");
    return separator > 0 && name.length > separator + 2 && GENERATED_FAMILIES.has(name.slice(0, separator));
  }
}
