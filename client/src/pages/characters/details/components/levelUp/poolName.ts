/**
 * A pool named with what it picks ("General Feats", "Wizard Spells"): its aptitude's name, with the noun added only when
 * the name lacks it. A name already ending in the noun keeps it, made plural ("Fighter Bonus Feat": "Fighter Bonus
 * Feats"). `what` is the noun's plural, its singular without the final "s" ("Feats", "Spells").
 */
export function poolName(name: string, what: string) {
  const last = name.split(/\s+/).at(-1)?.toLowerCase();
  const plural = what.toLowerCase();
  if (last === plural) return name;
  if (last === plural.replace(/s$/, "")) return `${name}s`;
  return `${name} ${what}`;
}
