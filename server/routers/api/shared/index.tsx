import { toJson } from "@/server/errors/index.ts";
import { buildBondedMap, buildFullCharacterResponse } from "@/server/rulesets/dnd3.5/buildCharacterResponse.ts";
import CharactersService from "@/server/services/CharactersService.ts";
import { zValidator } from "@hono/zod-validator";
import { pdf } from "@react-pdf/renderer";
import { Hono } from "hono";
import { z } from "zod";

const shared = new Hono()
  // Get shared character data (public, no auth)
  .get(
    "/characters/:shareToken",
    zValidator("param", z.object({ shareToken: z.string().uuid() })),
    async (c) => {
      const { shareToken } = c.req.valid("param");

      const result = await CharactersService.initialize().call(
        "getSharedCharacter",
        shareToken,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      const { character, detailedCharacter, bondedByKind, portraitUrl } = result[1];
      const response = buildFullCharacterResponse(character, detailedCharacter);
      const stripPrivate = <T extends { identity: { background: { privateNotes?: string } } }>(r: T): T => ({
        ...r,
        identity: {
          ...r.identity,
          background: { ...r.identity.background, privateNotes: undefined },
        },
      });

      return c.json({
        ...stripPrivate(response),
        bonded: buildBondedMap(bondedByKind, stripPrivate),
        portraitUrl,
      }, 200);
    },
  )
  // Generate PDF for shared character (public, no auth)
  .get(
    "/characters/:shareToken/pdf",
    zValidator("param", z.object({ shareToken: z.string().uuid() })),
    async (c) => {
      try {
        const { shareToken } = c.req.valid("param");

        const result = await CharactersService.initialize().call(
          "generateSharedPdf",
          shareToken,
        );
        const success = result[0];

        if (!success) {
          const [error, code] = toJson(result[2]);
          return c.json(error, code);
        }

        const { detailedCharacter, CharacterSheetComponent, portraitUrl, kind } = result[1];

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
    },
  );

export default shared;
