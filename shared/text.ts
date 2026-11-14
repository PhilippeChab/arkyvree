/** Text: as it's stored, a name, a label or a bonus written for display, or reduced to a slug. */

/** A character past ASCII: text with none has a slug of its letters and digits alone (`stripSeparators`). */
const BEYOND_ASCII = /[^\p{ASCII}]/u;
/** An unaccented Latin letter or a digit: what a slug keeps as it is, lowercased. */
const LATIN_LETTER_OR_DIGIT = /^[a-z0-9]$/i;
/** A letter or a digit of any script. */
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
/** The scripts a slug leaves out: Latin's accented letters, and the signs every script shares ("²", "½"). */
const SHARED_SCRIPTS = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]$/u;

/**
 * A character a slug holds (`stripSeparators`), as a pattern's source for a `u` expression: an unaccented Latin letter
 * or a digit, lowercase, or a lowercase or uncased letter or a digit of another script. What a target's grammar reads a
 * name's segment by (`aptitudes.<list>.allowed`).
 */
export const SLUG_CHARACTER =
  String.raw`(?:[a-z0-9]|(?![\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}` +
  String.raw`\p{Lu}\p{Lt}])[\p{L}\p{N}])`;

/** `s` with its first letter capitalized. */
export function capitalize(s: string) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

/** A bonus with its sign ("+2", "-1"), wherever one shows (a sheet, an attack's to-hit); a missing one reads "+0". */
export function formatSigned(value: number | null | undefined): string {
  const n = value ?? 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * A record's name as it's stored (a character's, a campaign's, a ruleset's): as its owner wrote it, canonically composed
 * (NFC, which changes no character it shows) and trimmed, never folded as an account's text is: "Kai²" stays "Kai²".
 * The server stores it so; the client measures it so.
 */
export function sanitizeName(name: string) {
  return name.normalize("NFC").trim();
}

/** Text as it's stored: Unicode-normalized (NFKC) and trimmed. The server stores it so; the client measures it so. */
export function sanitizeText(text: string) {
  return text.normalize("NFKC").trim();
}

/**
 * `s` as a slug, read a character at a time, lowercased: an unaccented Latin letter or a digit ("Weapon Focus:
 * Longsword" → "weaponfocuslongsword"), and a letter or a digit of another script (Cyrillic, Greek, Chinese…:
 * "Лазание" → "лазание"), so a name in that script has a slug of its own; anything else left out: spaces, punctuation,
 * a Latin letter with an accent ("Discrétion" → "discrtion"), a sign every script shares ("²", "½"). A name with no
 * character of another script has the slug it always had.
 */
export function stripSeparators(s: string) {
  const text = String(s);
  if (!BEYOND_ASCII.test(text)) return text.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  let slug = "";
  for (const character of text) {
    const kept =
      LATIN_LETTER_OR_DIGIT.test(character) || (LETTER_OR_DIGIT.test(character) && !SHARED_SCRIPTS.test(character));
    if (kept) slug += character.toLowerCase();
  }
  return slug;
}

/**
 * A label's words (`s`, in Title Case) as a sentence writes them: its first letter kept, the rest lowercase ("Owned
 * Step" in "Owned step not found").
 */
export function toSentenceCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
