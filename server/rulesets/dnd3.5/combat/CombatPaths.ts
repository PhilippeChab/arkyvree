import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The combat target paths: AC, hit points, attacks, initiative, speed, encumbrance. */
export default class CombatPaths implements PathCategory {
  readonly name = "combat";
  readonly label = "Combat";
  readonly description = "AC, hit points, attack bonuses, initiative, speed, armor and shield";
  readonly holder = { key: "combat", getter: "getCombat" };
  readonly pathDescriptions = {
    "combat.ac": "AC bonuses and totals",
    "combat.armor": "The armor worn",
    "combat.shield": "The shield carried",
    "combat.hp": "HP sources and total",
    "combat.initiative": "Initiative bonus components",
    "combat.grapple": "Grapple: BAB + Str + size",
    "combat.twoweapon": "Two-weapon fighting: each hand's penalty and the off hand's attacks",
    "combat.naturalattacks": "Natural attacks: the secondary ones' penalty, extra attacks, and their count",
    "combat.throwing": "Attacks with thrown weapons and slings",
    "combat.speed": "Movement speed (ft)",
    "combat.encumbrance": "Carry weight and load capacity",
  };
}
