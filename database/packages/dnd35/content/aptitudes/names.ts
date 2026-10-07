/**
 * How the content names its spell lists and its picks: a class's spell list, a cleric's domain and its list, a wizard
 * school's specialist list. The parser and the seeder name them alike.
 */

/** The aptitude a cleric picks a domain in. */
export const CLERIC_DOMAIN = "Cleric Domain";

/** A class's spell list: "Wizard Spells". */
export function classSpells(className: string): string {
  return `${className} Spells`;
}

/** A domain's feat, which a cleric picks in Cleric Domain: "Air Domain". */
export function domainFeat(domain: string): string {
  return `${domain} Domain`;
}

/** A domain's spell list: "Air Domain Spells". */
export function domainSpells(domain: string): string {
  return `${domainFeat(domain)} Spells`;
}

/** A wizard school's specialist spell list: "Evocation Specialist Spells". */
export function specialistSpells(school: string): string {
  return `${school} Specialist Spells`;
}
