import { pdf } from "@react-pdf/renderer";

import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { isProduction } from "@/server/environment.ts";
import { UnprocessableEntityError } from "@/server/errors/index.ts";
import { getSlotUrl } from "@/server/services/attachments/index.ts";
import { formatSheetFileName } from "@/shared/exports.ts";
import type { Character } from "@/shared/relations.ts";

import { readCharacterInput } from "./characterInputs.ts";

/** The most a character's printed sheet may weigh, as a PDF. */
const MAX_SHEET_BYTES = 10 * 1024 * 1024;

/** A rendered sheet's file: its bytes, refused over 10 MB, and its name, the character's (`formatSheetFileName`). */
export function toSheetFile(data: ArrayBuffer, characterName: string) {
  if (data.byteLength > MAX_SHEET_BYTES) {
    // Rounded up to a tenth, so a sheet past the cap never reads as at it
    const megabytes = (bytes: number) => Math.ceil((bytes / 1024 / 1024) * 10) / 10;
    throw new UnprocessableEntityError(
      `This sheet's PDF is too large (${megabytes(data.byteLength)} MB, max ${megabytes(MAX_SHEET_BYTES)} MB)`,
    );
  }
  return { data: Buffer.from(data), fileName: formatSheetFileName(characterName) };
}

/**
 * A character's printed sheet as a PDF file, the queued export's and a share link's alike: its sheet read as its reader
 * reads it, its private notes shown (its exporters: its editors, and its campaign's Game Master) or left out (a share
 * link's reader), rendered, and named after the character (`toSheetFile`).
 */
export async function renderCharacterSheet(characterRecord: Character, notes: "hide" | "show") {
  const portraitUrl = await getSlotUrl("portrait", characterRecord.id);
  const sheet = await withRulesetScope(db, characterRecord.rulesetId, async (scope) =>
    Engine.for(scope)
      .character(await readCharacterInput(db, characterRecord))
      .describeSheet({ diagnostics: !isProduction(), portraitUrl }, notes),
  );
  return toSheetFile(await (await pdf(sheet).toBlob()).arrayBuffer(), characterRecord.name);
}
