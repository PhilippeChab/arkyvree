/** What the app exports: a character's sheet as a PDF, the server's queued export and a shared sheet's download alike. */

/** The most of the character's name a sheet's file name keeps, in what a reader sees as characters: an emoji is one. */
const FILE_NAME_LENGTH = 200;

/** What a file name can't hold, on any system the file is saved to. */
const FILE_NAME_RESERVED = /[/\\?%*:|"<>]/g;

/**
 * A text's graphemes, what a reader sees as one character each; its code points where the runtime has no segmenter (a
 * browser before `Intl.Segmenter`), which keep an emoji of one whole. Built on use: the client loads this module too.
 */
function splitGraphemes(text: string) {
  if (typeof Intl.Segmenter !== "function") return Array.from(text);
  return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment);
}

/** A sheet's file name: the character's name ("character" when it has none), what a file name can't hold replaced. */
export function formatSheetFileName(characterName: string) {
  const name = (characterName || "character").replace(FILE_NAME_RESERVED, "_");
  // Cut between graphemes: a family, a flag or a skin tone is several code points, never cut in two
  const graphemes = splitGraphemes(name);
  return `${graphemes.slice(0, FILE_NAME_LENGTH).join("")}-sheet.pdf`;
}
