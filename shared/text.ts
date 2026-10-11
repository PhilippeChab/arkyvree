/** Text: as it's stored, a name, a label or a bonus written for display, or reduced to a slug. */

/** `s` with its first letter capitalized. */
export function capitalize(s: string) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

/** A bonus with its sign ("+2", "-1"), wherever one shows (a sheet, an attack's to-hit); a missing one reads "+0". */
export function formatSigned(value: number | null | undefined): string {
  const n = value ?? 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

/** Text as it's stored: Unicode-normalized (NFKC) and trimmed. The server stores it so; the client measures it so. */
export function sanitizeText(text: string) {
  return text.normalize("NFKC").trim();
}

/** `s` as a slug: its letters and digits, lowercased ("Weapon Focus: Longsword" → "weaponfocuslongsword"). */
export function stripSeparators(s: string) {
  return String(s)
    .replaceAll(/[^a-z0-9]/gi, "")
    .toLowerCase();
}
