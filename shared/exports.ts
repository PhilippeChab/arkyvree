/** What the app exports: a character's sheet as a PDF, the server's queued export and a shared sheet's download alike. */

/** The most of the character's name a sheet's file name keeps, in what a reader sees as characters: an emoji is one. */
const FILE_NAME_LENGTH = 200;

/** What a file name can't hold, on any system the file is saved to. */
const FILE_NAME_RESERVED = /[/\\?%*:|"<>]/g;

/** A sheet's file name: the character's name ("character" when it has none), what a file name can't hold replaced. */
export function formatSheetFileName(characterName: string) {
  const name = (characterName || "character").replace(FILE_NAME_RESERVED, "_");
  // Cut between graphemes: a family, a flag or a skin tone is several code points, never cut in two
  const graphemes = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name),
    (s) => s.segment,
  );
  return `${graphemes.slice(0, FILE_NAME_LENGTH).join("")}-sheet.pdf`;
}
