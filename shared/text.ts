/** Text: a name or a label written for display, or reduced to a slug. */

/** A name's first letter, capitalized, for an avatar. */
export function getInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

/** `s` with its first letter capitalized. */
export function capitalize(s: string) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

/** `s` as a slug: its letters and digits, lowercased ("Weapon Focus: Longsword" → "weaponfocuslongsword"). */
export function stripSeparators(s: string) {
  return String(s)
    .replaceAll(/[^a-z0-9]/gi, "")
    .toLowerCase();
}
