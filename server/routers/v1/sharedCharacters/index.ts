import { pdf } from "@react-pdf/renderer";
import { Hono } from "hono";
import { z } from "zod";

import { apiExportRateLimit, type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { buildFileHeaders } from "@/server/routers/fileHeaders.ts";
import { v1Character } from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

const shareTokenParam = z.object({ shareToken: z.string().uuid() });

/** A character shared by its owner's link: its sheet, and its PDF, which anyone with the token reads. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:shareToken",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "A character its owner shares, by its link's token: its sheet, with its bonded creatures'",
    }),
    validate("param", shareTokenParam),
    async (c) => {
      const { shareToken } = c.req.valid("param");
      return c.json(V1.character(await CharacterSharingService.getSharedCharacter(shareToken)), 200);
    },
  )
  // A render each request, counted as the app's shared sheets are
  .get(
    "/:shareToken/pdf",
    describeRoute({
      file: "application/pdf",
      response: null,
      status: 200,
      summary: "A shared character's PDF, made as it's asked for",
    }),
    apiExportRateLimit,
    validate("param", shareTokenParam),
    async (c) => {
      const { shareToken } = c.req.valid("param");
      const sheet = await pdf(await CharacterSharingService.generateSharedPdf(shareToken)).toBlob();
      const headers = buildFileHeaders({
        disposition: "inline",
        fileName: "shared-character.pdf",
        mimeType: "application/pdf",
      });
      return c.body(await sheet.arrayBuffer(), 200, headers);
    },
  );
