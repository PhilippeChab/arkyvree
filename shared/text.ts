/** Text: as it's stored, a name, a label or a bonus written for display, or reduced to a slug. */

/** A character past ASCII: text with none has a slug of its letters and digits alone (`stripSeparators`). */
const BEYOND_ASCII = /[^\p{ASCII}]/u;
/** A Latin letter or digit, in any form: accented ("é"), a letter of its own ("ß", "ø", "æ"), a ligature, fullwidth. */
const LATIN = /^\p{scx=Latin}$/u;
/**
 * The Latin letters no decomposition takes to plain letters, lowercase, and the plain letters each reads as: a key
 * (`stripSeparators`) writes them so, as it writes "é" as "e".
 */
const LATIN_FOLDS = new Map([
  ["æ", "ae"],
  ["ð", "d"],
  ["đ", "d"],
  ["ħ", "h"],
  ["ı", "i"],
  ["ȷ", "j"],
  ["ł", "l"],
  ["œ", "oe"],
  ["ø", "o"],
  ["ß", "ss"],
  ["þ", "th"],
  ["ŧ", "t"],
]);
/** An unaccented Latin letter or a digit: what a slug keeps as it is, lowercased. */
const LATIN_LETTER_OR_DIGIT = /^[a-z0-9]$/i;
/** A letter of the Latin script itself, never one it shares with another ("ʼ"): what a fold may leave of a letter. */
const LATIN_SCRIPT_LETTER = /^(?=\p{sc=Latin})[\p{L}\p{N}]$/u;
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
 * too). What a target's grammar reads a name's segment by (`aptitudes.<list>.allowed`). It reads an accented Latin
 * letter as well, which a key never holds (it writes "é" as "e"), so a target written with one names no list. Its
 * alternatives never match the same character: a `+` of them that could would backtrack without end on a target it
 * doesn't match.
 */
export const SLUG_CHARACTER = String.raw`(?:[0-9]|\p{M}|(?![\p{scx=Common}\p{scx=Inherited}\p{Changes_When_Lowercased}])[\p{L}\p{N}])`;

/**
 * A Latin letter or digit past ASCII (`character`) as its plain letters, lowercase: its accents left out, whether its
 * letter carries them ("é", "Ǿ") or not ("ø"), a ligature and a compatibility form taken apart ("ĳ", "ﬁ", "Ａ"), and a
 * letter of its own read as `LATIN_FOLDS` says ("ß" is "ss"). A Latin letter none of those reduce stays, lowercased
 * ("ŋ", "ə"); a sign one leaves ("ŀ"'s middle dot) is left out.
 */
function plainLettersOf(character: string) {
  let plain = "";
  for (const part of character.toLowerCase().normalize("NFKD")) {
    const folded = LATIN_FOLDS.get(part);
    if (folded) plain += folded;
    else if (LATIN_LETTER_OR_DIGIT.test(part) || LATIN_SCRIPT_LETTER.test(part)) plain += part.toLowerCase();
  }
  return plain;
}

/**
 * `s` as a slug, read a character at a time: an unaccented Latin letter or a digit, lowercased, and one past ASCII as
 * `latinOf` writes it, the marks that follow either left out; a letter, a digit or a sign of another script with the
 * marks that follow it, each word of them lowercased whole; anything else left out.
 */
function slugOf(text: string, latinOf: (character: string) => string) {
  let slug = "";
  // The word of another script being read, lowercased whole once it ends
  let word = "";
  for (const character of text) {
    const kept = LETTER_OR_DIGIT.test(character) && !SHARED_SCRIPTS.test(character);
    const latin = kept && LATIN.test(character);
    if ((kept && !latin) || (word && MARK.test(character))) {
      word += character;
      continue;
    }
    slug += word.toLowerCase();
    word = "";
    if (LATIN_LETTER_OR_DIGIT.test(character)) slug += character.toLowerCase();
    else if (latin) slug += latinOf(character);
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
 * `s` as a slug, its key, read a character at a time. A Latin letter or a digit, lowercased, its accents left out,
 * written on it or apart ("Discrétion" and "Discre\u0301tion" → "discretion", "Élan" → "elan"), a letter of its own and
 * a ligature as its plain letters ("ß" → "ss", "æ" → "ae", "œ" → "oe", "ø" → "o", "ł" → "l", "đ" and "ð" → "d", "þ" →
 * "th", "ı" → "i"), so a path names it with its accents or without; a letter, a digit or a sign of another script
 * (Cyrillic, Greek, Hindi, Japanese…), with the marks that follow it (a Hindi or Thai vowel sign), each word of them
 * lowercased whole (a Greek word's final sigma: "ΟΔΟΣ" and "Οδος" are "οδος"), so a name in any script has a slug of
 * its own ("Лазание" → "лазание", "й" isn't "и", "ビール" isn't "ビル"); anything else left out: spaces, punctuation, a
 * sign every script shares ("²", "½"). Only a Latin letter past ASCII reads otherwise than it did before keys read
 * accents so (`stripSeparatorsDroppingAccents`): a name without one keeps its key, "Weapon Focus: Longsword" →
 * "weaponfocuslongsword".
 */
export function stripSeparators(s: string) {
  const text = String(s);
  if (!BEYOND_ASCII.test(text)) return text.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  return slugOf(text, plainLettersOf);
}

/**
 * `s`'s key as it was before keys read accented Latin letters as their plain letters: as `stripSeparators`, but its
 * Latin letters past ASCII and their marks left out ("Discrétion" → "discrtion", "Élan" → "lan", "Straße" → "strae").
 * What the rules stored before then still hold until `scripts/db/rekey-names.ts` rewrites them, which a binding reads
 * past (`NameBindingReader.isStale`).
 */
export function stripSeparatorsDroppingAccents(s: string) {
  const text = String(s);
  if (!BEYOND_ASCII.test(text)) return text.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  return slugOf(text, () => "");
}

/**
 * A label's words (`s`, in Title Case) as a sentence writes them: its first letter kept, the rest lowercase ("Owned
 * Step" in "Owned step not found").
 */
export function toSentenceCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
