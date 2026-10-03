import { pdf } from "@react-pdf/renderer";
import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import { buildBondedMap, buildFullCharacterResponse } from "@/server/rulesets/dnd3.5/buildCharacterResponse.ts";
import { redactPrivateNotes } from "@/server/rulesets/redactPrivateNotes.ts";
import { CharactersService } from "@/server/services/characters/index.ts";

const shared = new Hono()
  // Get shared character data (public, no auth)
  .get("/characters/:shareToken", zValidator("param", z.object({ shareToken: z.string().uuid() })), async (c) => {
    const { shareToken } = c.req.valid("param");

    const { character, detailedCharacter, bondedByKind, portraitUrl } =
      await CharactersService.getSharedCharacter(shareToken);
    const response = buildFullCharacterResponse(character, detailedCharacter);
    return c.json(
      {
        ...redactPrivateNotes(response, undefined),
        bonded: buildBondedMap(bondedByKind, (entry) => redactPrivateNotes(entry, undefined)),
        portraitUrl,
      },
      200,
    );
  })
  // Generate PDF for shared character (public, no auth)
  .get("/characters/:shareToken/pdf", zValidator("param", z.object({ shareToken: z.string().uuid() })), async (c) => {
    const { shareToken } = c.req.valid("param");
    // Outside the try: a token that finds no character is a 404, not a failed render.
    const { detailedCharacter, CharacterSheetComponent, portraitUrl, kind } =
      await CharactersService.generateSharedPdf(shareToken);

    try {
      const pdfBlob = await pdf(
        <CharacterSheetComponent detailedCharacter={detailedCharacter} portraitUrl={portraitUrl} kind={kind} />,
      ).toBlob();

      const arrayBuffer = await pdfBlob.arrayBuffer();

      return new Response(arrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="shared-character.pdf"`,
        },
      });
    } catch (error) {
      console.error("[api] Error generating shared PDF:", error);
      return c.json({ error: "Failed to generate PDF" }, 500);
    }
  });

export default shared;
