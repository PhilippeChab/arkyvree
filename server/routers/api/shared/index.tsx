import { pdf } from "@react-pdf/renderer";
import { Hono } from "hono";
import { z } from "zod";

import { validate } from "@/server/middlewares/index.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

const shareTokenParam = z.object({ shareToken: z.string().uuid() });

export default new Hono()
  // Get shared character data (public, no auth)
  .get("/characters/:shareToken", validate("param", shareTokenParam), async (c) => {
    const { shareToken } = c.req.valid("param");
    return c.json(await CharacterSharingService.getSharedCharacter(shareToken), 200);
  })
  // Generate PDF for shared character (public, no auth)
  .get("/characters/:shareToken/pdf", validate("param", shareTokenParam), async (c) => {
    const { shareToken } = c.req.valid("param");
    const { detailedCharacter, CharacterSheetComponent, portraitUrl, kind } =
      await CharacterSharingService.generateSharedPdf(shareToken);
    const pdfBlob = await pdf(
      <CharacterSheetComponent detailedCharacter={detailedCharacter} portraitUrl={portraitUrl} kind={kind} />,
    ).toBlob();

    return new Response(await pdfBlob.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="shared-character.pdf"`,
      },
    });
  });
