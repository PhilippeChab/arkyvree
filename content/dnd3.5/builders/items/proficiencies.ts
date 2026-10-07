/**
 * Being proficient with a weapon, an armor or a shield: the requirements an item and a prerequisite are written with.
 */

import { and, eq, eqStr, feat, or } from "@/content/dnd3.5/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/dnd3.5/builders/customization/types.ts";

import { getWeaponDefinition, MARTIAL_WEAPONS, SIMPLE_WEAPONS } from "./weapons.ts";

export const HEAVY_ARMOR_PROF: RequirementEntry[] = [eq(feat("Armor Proficiency (Heavy)"))];
export const LIGHT_ARMOR_PROF: RequirementEntry[] = [eq(feat("Armor Proficiency (Light)"))];
export const MEDIUM_ARMOR_PROF: RequirementEntry[] = [eq(feat("Armor Proficiency (Medium)"))];
export const SHIELD_PROF: RequirementEntry[] = [eq(feat("Shield Proficiency"))];
export const TOWER_SHIELD_PROF: RequirementEntry[] = [eq(feat("Tower Shield Proficiency"))];

/**
 * Being proficient with an exotic weapon: with it, or with martial weapons when it counts as one, by its wielder's race
 * (a dwarf's waraxe and urgrosh, a gnome's hooked hammer) or, `held`, in two hands (a bastard sword, a dwarven waraxe):
 * what only a weapon's own proficiency reads, a prerequisite holding no weapon.
 */
function exoticProficiency(weapon: string, held: boolean): RequirementEntry[] {
  const definition = getWeaponDefinition(weapon);
  const asMartial = [
    ...(held && definition?.oneHandTraining ? [eqStr("weapon.wielded", "twohanded")] : []),
    ...(definition?.familiarity ? [eqStr("identity.physiology.race.name", definition.familiarity)] : []),
  ];
  const own = eq(feat(`Exotic Weapon Proficiency: ${weapon}`));
  if (asMartial.length === 0) return [own];
  const when = asMartial.length === 1 ? asMartial[0] : or(...asMartial);
  return [or(own, and(eq(feat("Martial Weapon Proficiency")), when))];
}

/** An exotic weapon's proficiency, which the weapon requires: in two hands too. */
export function exotic(weapon: string): RequirementEntry[] {
  return exoticProficiency(weapon, true);
}

/** Being proficient with a martial weapon: with them all, or with it alone. */
export function martial(weapon: string): RequirementEntry[] {
  return [or(eq(feat("Martial Weapon Proficiency")), eq(feat(`Martial Weapon Proficiency: ${weapon}`)))];
}

/** Being proficient with `weapon`, by its group. */
export function proficiencyRequirements(weapon: string): RequirementEntry[] {
  if (SIMPLE_WEAPONS.some((simpleWeapon) => simpleWeapon === weapon)) return simple(weapon);
  if (MARTIAL_WEAPONS.some((martialWeapon) => martialWeapon === weapon)) return martial(weapon);
  return exoticProficiency(weapon, false);
}

/**
 * Being proficient with a simple weapon: with them all, or with it alone. A strike with a gauntlet "is otherwise
 * considered an unarmed attack": the unarmed strike's proficiency is the gauntlet's too.
 */
export function simple(weapon: string): RequirementEntry[] {
  return [
    or(
      eq(feat("Simple Weapon Proficiency")),
      eq(feat(`Simple Weapon Proficiency: ${weapon}`)),
      ...(weapon === "Gauntlet" ? [eq(feat("Simple Weapon Proficiency: Unarmed Strike"))] : []),
    ),
  ];
}
