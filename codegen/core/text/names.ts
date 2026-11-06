/** A name written as code and file names take it. */

/** A name in camel case, its apostrophes dropped and its words joined: "Arcane Archer" → "arcaneArcher". */
export function toCamelCase(name: string): string {
  return name
    .replace(/['']/g, "")
    .split(/[\s-]+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("");
}
