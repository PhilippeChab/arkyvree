/**
 * The names of the proficiency feats, a family's each, as the content and the engine name them: a saving throw's, an
 * armor training's, a weapon's or a category of weapons', a tool's, a skill's (the engine makes those, a skill each)
 * and a weapon's mastery.
 */

/** An armor training's feat, by the category it trains in ("Armor Training: Heavy Armor", "Armor Training: Shields"). */
export function armorTraining(category: string): string {
  return `Armor Training: ${category}`;
}

/** A skill's Expertise's feat, as the engine makes it for each skill ("Expertise: Stealth"). */
export function expertise(skill: string): string {
  return `Expertise: ${skill}`;
}

/** A saving throw's proficiency's feat, by its ability ("Saving Throw Proficiency: Strength"). */
export function savingThrowProficiency(ability: string): string {
  return `Saving Throw Proficiency: ${ability}`;
}

/** A skill's proficiency's feat, as the engine makes it for each skill ("Skill Proficiency: Athletics"). */
export function skillProficiency(skill: string): string {
  return `Skill Proficiency: ${skill}`;
}

/** A tool's proficiency's feat ("Tool Proficiency: Thieves' Tools"). */
export function toolProficiency(tool: string): string {
  return `Tool Proficiency: ${tool}`;
}

/** A weapon's mastery's feat ("Weapon Mastery: Longsword"). */
export function weaponMastery(weapon: string): string {
  return `Weapon Mastery: ${weapon}`;
}

/** A weapon's proficiency's feat, or a category's ("Weapon Proficiency: Martial Weapons", "…: Scimitar"). */
export function weaponProficiency(weapons: string): string {
  return `Weapon Proficiency: ${weapons}`;
}
