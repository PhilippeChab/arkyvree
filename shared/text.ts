/** Text: as it's stored, a name, a label or a bonus written for display, or reduced to a slug. */

/** A character past ASCII: text with none has a slug of its letters and digits alone (`stripSeparators`). */
const BEYOND_ASCII = /[^\p{ASCII}]/u;
/** An unaccented Latin letter or a digit: what a slug keeps as it is, lowercased. */
const LATIN_LETTER_OR_DIGIT = /^[a-z0-9]$/i;
/** A letter or a digit of any script. */
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
/** A mark: a vowel sign of Hindi or Thai, an accent written apart from its letter. */
const MARK = /^\p{M}$/u;
/**
 * The characters of the scripts a slug leaves out, by the scripts each is written in (`Script_Extensions`): Latin's
 * accented letters, and the signs every script shares ("²", "½"), never one a single script uses ("ー", Japanese's).
 */
const SHARED_SCRIPTS = /^[\p{scx=Latin}\p{scx=Common}\p{scx=Inherited}]$/u;

/**
 * A character a slug holds (`stripSeparators`), as a pattern's source for a `u` expression: an unaccented Latin letter
 * or a digit, lowercase, or a letter, a digit or a mark of another script as lowercasing leaves it (one with no
 * lowercase form, "ϒ", too). What a target's grammar reads a name's segment by (`aptitudes.<list>.allowed`).
 */
export const SLUG_CHARACTER =
  String.raw`(?:[a-z0-9]|\p{M}|(?![\p{scx=Latin}\p{scx=Common}\p{scx=Inherited}` +
  String.raw`\p{Changes_When_Lowercased}])[\p{L}\p{N}])`;

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
 * `s` as a slug, read a character at a time: an unaccented Latin letter or a digit, lowercased ("Weapon Focus:
 * Longsword" → "weaponfocuslongsword"), and a letter, a digit or a sign of another script (Cyrillic, Greek, Hindi,
 * Japanese…), with the marks that follow it (a Hindi or Thai vowel sign), each word of them lowercased whole (a Greek
 * word's final sigma: "ΟΔΟΣ" and "Οδος" are "οδος"), so a name in that script has a slug of its own ("Лазание" →
 * "лазание", "ビール" isn't "ビル"); anything else left out: spaces, punctuation, a Latin letter with an accent, written
 * apart or not ("Discrétion" → "discrtion"), a sign every script shares ("²", "½"). A name with no character of
 * another script has the slug it always had.
 */
export function stripSeparators(s: string) {
  const text = String(s);
  if (!BEYOND_ASCII.test(text)) return text.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  let slug = "";
  // The word of another script being read, lowercased whole once it ends
  let word = "";
  for (const character of text) {
    const another = LETTER_OR_DIGIT.test(character) && !SHARED_SCRIPTS.test(character);
    if (another || (word && MARK.test(character))) {
      word += character;
      continue;
    }
    slug += word.toLowerCase();
    word = "";
    if (LATIN_LETTER_OR_DIGIT.test(character)) slug += character.toLowerCase();
  }
  return slug + word.toLowerCase();
}

/**
 * A label's words (`s`, in Title Case) as a sentence writes them: its first letter kept, the rest lowercase ("Owned
 * Step" in "Owned step not found").
 */
export function toSentenceCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
