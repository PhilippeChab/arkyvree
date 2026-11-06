import AbilitiesPaths from "@/engine/rulesets/pf1/model/abilities/AbilitiesPaths.ts";
import CombatPaths from "@/engine/rulesets/pf1/model/combat/CombatPaths.ts";
import WeaponPaths from "@/engine/rulesets/pf1/model/combat/WeaponPaths.ts";
import IdentityPaths from "@/engine/rulesets/pf1/model/identity/IdentityPaths.ts";
import SavesPaths from "@/engine/rulesets/pf1/model/saves/SavesPaths.ts";
import SkillsPaths from "@/engine/rulesets/pf1/model/skills/SkillsPaths.ts";
import SpellcastingPaths from "@/engine/rulesets/pf1/model/spellcasting/SpellcastingPaths.ts";
import type { OperatorKind } from "@/shared/customization/target.ts";

/** The target paths a book's generated content may name. */
export default class BookPaths {
  /**
   * The target paths of `kind` a book's content can name before a ruleset holds it: its abilities', saves' and skills'
   * (by their `names`), and the combat, weapon, identity and spellcasting paths every character has. What the codegen
   * checks a book's modifiers and requirements against.
   */
  static listBookTargetPaths(names: Partial<Record<string, string[]>>, kind: OperatorKind) {
    const named = (list: string[] = []) => list.map((name) => ({ name }));
    return [
      ...AbilitiesPaths.generateAbilityPaths(named(names.abilities), kind),
      ...CombatPaths.generateCombatPaths(kind),
      ...WeaponPaths.generateItemWeaponPaths(kind),
      ...SavesPaths.generateSavePaths(named(names.saves), kind),
      ...SkillsPaths.generateSkillPaths(named(names.skills), kind),
      ...IdentityPaths.generateIdentityPaths(kind),
      ...SpellcastingPaths.generateSpellcastingPaths(kind),
    ];
  }
}
