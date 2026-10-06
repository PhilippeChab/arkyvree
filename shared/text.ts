/** Text: as it's stored, a name or a label written for display, or reduced to a slug. */

/** A name's first letter, capitalized, for an avatar. */
export function getInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

/** `s` with its first letter capitalized. */
export function capitalize(s: string) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

/** Text as it's stored: Unicode-normalized (NFKC) and trimmed. The server stores it so; the client measures it so. */
export function sanitizeText(text: string) {
  return text.normalize("NFKC").trim();
}

/** An email address as it's stored: sanitized text, lowercased. */
export function sanitizeEmail(email: string) {
  return sanitizeText(email).toLowerCase();
}

/** `s` as a slug: its letters and digits, lowercased ("Weapon Focus: Longsword" → "weaponfocuslongsword"). */
export function stripSeparators(s: string) {
  return String(s)
    .replaceAll(/[^a-z0-9]/gi, "")
    .toLowerCase();
}
