import { eq, or } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import type { SheetBlock } from "@/engine/core/module/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLinks } from "@/server/repositories/index.ts";

/** The notes a sheet's identity block holds: its public ones, and its private ones for a reader who reads them. */
export function notesOf(sheet: { blocks: SheetBlock[] }) {
  const identity = sheet.blocks.find((block) => block.key === "identity");
  if (identity?.kind !== "fields") throw new Error("no identity block");
  return identity.notes;
}

/** The subsheets a sheet's entries hold: its bonded creatures', each in the details of the entry that bonds it. */
export function subsheetsOf(sheet: { blocks: SheetBlock[] }) {
  return sheet.blocks.flatMap((block) =>
    block.kind === "entries"
      ? block.entries.flatMap((entry) => (entry.subsheet ? [{ entryId: entry.id, id: entry.subsheet.id }] : []))
      : [],
  );
}

/**
 * Moves a character's last change, and its bonded creatures', back to `at`, long before any test, writing it alone
 * (the database keeps what such a write sets): a test's writes all run at its transaction's start, so a change the test
 * makes then moves the character past `at`.
 */
export async function backdateLastChange(characterId: string, at = "2000-01-01T00:00:00Z") {
  await db
    .update(charactersInCharacter)
    .set({ lastChangedAt: at })
    .where(or(eq(charactersInCharacter.id, characterId), eq(charactersInCharacter.parentCharacterId, characterId)));
}

/** A character's links of a role it holds many of (`role`: 3.5's `score`, `speaks`), as stored, in their order. */
export async function findLinks(role: string, characterId: string) {
  return (await CharacterLinks.findPerRole(db, { characterId }))[role];
}
