import { Hono } from "hono";

import { apiExportRateLimit, type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { formatContentDisposition } from "@/server/routers/api/contentDisposition.ts";
import { shareTokenParam } from "@/server/routers/api/validation.ts";
import { v1Character } from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

/** A character shared by its owner's link: its sheet, and its PDF, which anyone with the token reads. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:shareToken",
    describeRoute({
      response: v1Character,
      status: 200,
      summary:
        "A character its owner shares, by its link's token: its sheet, with its child characters' " +
        "(3.5: bonded creatures)",
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
      const { data, fileName } = await CharacterSharingService.generateSharedPdf(shareToken);
      const headers = {
        "Content-Disposition": formatContentDisposition("inline", fileName),
        "Content-Type": "application/pdf",
      };
      return c.body(new Uint8Array(data), 200, headers);
    },
  );
