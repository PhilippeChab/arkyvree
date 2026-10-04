/** Text: a name or a label written for display, or reduced to a slug. */

/** `s` with its first letter capitalized. */
export const capitalize = (s: string) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/** A name's first letter, capitalized, for an avatar. */
export const getInitial = (name: string) => name.charAt(0).toUpperCase();

/** `s` as a slug: its letters and digits, lowercased ("Weapon Focus: Longsword" → "weaponfocuslongsword"). */
export const stripSeparators = (s: string) =>
  String(s)
    .replaceAll(/[^a-z0-9]/gi, "")
    .toLowerCase();
