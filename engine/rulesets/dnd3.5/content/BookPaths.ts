import AbilitiesPaths from "@/engine/rulesets/dnd3.5/abilities/AbilitiesPaths.ts";
import CombatPaths from "@/engine/rulesets/dnd3.5/combat/CombatPaths.ts";
import WeaponPaths from "@/engine/rulesets/dnd3.5/combat/WeaponPaths.ts";
import IdentityPaths from "@/engine/rulesets/dnd3.5/identity/IdentityPaths.ts";
import SavesPaths from "@/engine/rulesets/dnd3.5/saves/SavesPaths.ts";
import SkillsPaths from "@/engine/rulesets/dnd3.5/skills/SkillsPaths.ts";

/** The target paths a book's generated content may name. */
export default class BookPaths {
  /**
   * The target paths of `kind` a book's content can name before a ruleset holds it: its abilities', saves' and skills'
   * (by their `names`), and the combat, weapon and identity paths every character has. What the codegen checks a book's
   * modifiers and requirements against.
   */
  static list(names: { abilities: string[]; saves: string[]; skills: string[] }, kind: "modifier" | "requirement") {
    const named = (list: string[]) => list.map((name) => ({ name }));
    return [
      ...AbilitiesPaths.generateAbilityPaths(named(names.abilities), kind),
      ...CombatPaths.generateCombatPaths(kind),
      ...WeaponPaths.generateItemWeaponPaths(kind),
      ...SavesPaths.generateSavePaths(named(names.saves), kind),
      ...SkillsPaths.generateSkillPaths(named(names.skills), kind),
      ...IdentityPaths.generateIdentityPaths(kind),
    ];
  }
}
