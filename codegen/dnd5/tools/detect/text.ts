/** A reference's text as a description takes it: plain, the line breaks the PDF made in its words undone. */

import { DASHED_WORDS } from "@/codegen/dnd5/tools/terms/words.ts";

/** A word broken over two lines by a hyphen, as the database kept it ("Ar- mor"): its halves. */
const BROKEN_WORD = /(\p{Ll})- (\p{Ll}+)/gu;

/** A phrase the database's Markdown makes bold or italic ("**Two Cantrips.**"): its text. */
const EMPHASIS = /\*{1,3}([^*\n]+?)\*{1,3}/g;

/**
 * `text` as a description takes it, plain text: a word the PDF broke over two lines joined ("Ar- mor": "Armor"; a
 * dash the PDF made a hyphen, "at a time- the most", one again), the Markdown's emphasis left out ("**Two Cantrips.**":
 * "Two Cantrips."), each paragraph's indent and trailing spaces too.
 */
export function normalizeText(text: string): string {
  return text
    .replace(BROKEN_WORD, (_, end: string, next: string) => `${end}${DASHED_WORDS.includes(next) ? "—" : ""}${next}`)
    .replace(EMPHASIS, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
