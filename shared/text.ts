/** Text: as it's stored, a name, a label or a bonus written for display, or reduced to a slug. */

/** A character past ASCII: text with none has a slug of its letters and digits alone (`stripSeparators`). */
const BEYOND_ASCII = /[^\p{ASCII}]/u;
/** A Latin letter or digit, in any form: accented ("é"), a letter of its own ("ß", "ø", "æ"), a ligature, fullwidth. */
const LATIN = /^\p{scx=Latin}$/u;
/** An unaccented Latin letter or a digit: what a slug keeps as it is, lowercased. */
const LATIN_LETTER_OR_DIGIT = /^[a-z0-9]$/i;
/** A letter or a digit of any script. */
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
/** A mark: a vowel sign of Hindi or Thai, an accent written apart from its letter. */
const MARK = /^\p{M}$/u;
/**
 * The characters of the scripts a slug leaves out, by the scripts each is written in (`Script_Extensions`): the signs
 * every script shares ("²", "½"), never one a single script uses ("ー", Japanese's).
 */
const SHARED_SCRIPTS = /^[\p{scx=Common}\p{scx=Inherited}]$/u;

/**
 * A character a slug holds (`stripSeparators`), as a pattern's source for a `u` expression: a digit, a mark, or a letter
 * or a digit of any script but the signs every script shares, as lowercasing leaves it (one with no lowercase form, "ϒ",
 * "ß", too). What a target's grammar reads a name's segment by (`aptitudes.<list>.allowed`). Its alternatives never
 * match the same character: a `+` of them that could would backtrack without end on a target it doesn't match.
 */
export const SLUG_CHARACTER = String.raw`(?:[0-9]|\p{M}|(?![\p{scx=Common}\p{scx=Inherited}\p{Changes_When_Lowercased}])[\p{L}\p{N}])`;

/**
 * `s` as a slug, read a character at a time (`keepsAccents`: a Latin letter past ASCII kept, or left out as keys
 * once did): an unaccented Latin letter or a digit, lowercased, and an accented one with the marks that follow it, each
 * lowercased; a letter, a digit or a sign of another script with the marks that follow it, each word of them
 * lowercased whole; anything else left out.
 */
function slugOf(text: string, keepsAccents: boolean) {
  let slug = "";
  // The word of another script being read, lowercased whole once it ends
  let word = "";
  // Whether the last character kept was a Latin letter, whose marks stay with it
  let latin = false;
  for (const character of text) {
    const kept = LETTER_OR_DIGIT.test(character) && !SHARED_SCRIPTS.test(character);
    if ((kept && !LATIN.test(character)) || (word && MARK.test(character))) {
      word += character;
      continue;
    }
    slug += word.toLowerCase();
    word = "";
    latin = LATIN_LETTER_OR_DIGIT.test(character) || (keepsAccents && (kept || (latin && MARK.test(character))));
    if (latin) slug += character.toLowerCase();
  }
  return slug + word.toLowerCase();
}

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
 * `s` as a slug, its key: canonically composed (NFC: an "é" typed as "e" and an accent is the "é"), then read a
 * character at a time. A Latin letter or a digit, lowercased, accented or not ("Discrétion" → "discrétion"), with the
 * marks that follow it, a letter of its own and a ligature kept as letters ("ß", "æ", "œ", "ø", "đ", "ı"; "İ" is "i̇");
 * a letter, a digit or a sign of another script (Cyrillic, Greek, Hindi, Japanese…), with the marks that follow it
 * (a Hindi or Thai vowel sign), each word of them lowercased whole (a Greek word's final sigma: "ΟΔΟΣ" and "Οδος" are
 * "οδος"), so a name in any script has a slug of its own ("Лазание" → "лазание", "ビール" isn't "ビル"); anything else
 * left out: spaces, punctuation, a sign every script shares ("²", "½"). A name of plain ASCII has the slug it always
 * had ("Weapon Focus: Longsword" → "weaponfocuslongsword").
 */
export function stripSeparators(s: string) {
  const text = String(s);
  if (!BEYOND_ASCII.test(text)) return text.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  return slugOf(text.normalize("NFC"), true).normalize("NFC");
}

/**
 * `s`'s key as it was before keys kept accented Latin letters: as `stripSeparators`, uncomposed, its Latin
 * letters past ASCII and their marks left out ("Discrétion" → "discrtion"). What the rules stored before then still
 * hold until `scripts/db/rekey-names.ts` rewrites them, which a binding reads past (`NameBindingReader.isStale`).
 */
export function stripSeparatorsDroppingAccents(s: string) {
  const text = String(s);
  if (!BEYOND_ASCII.test(text)) return text.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  return slugOf(text, false);
}

/**
 * A label's words (`s`, in Title Case) as a sentence writes them: its first letter kept, the rest lowercase ("Owned
 * Step" in "Owned step not found").
 */
export function toSentenceCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
