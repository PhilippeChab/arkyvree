import { Hono } from "hono";
import { z } from "zod";

import { exportRateLimit, validate } from "@/server/middlewares/index.ts";
import { formatContentDisposition } from "@/server/routers/api/contentDisposition.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

const shareTokenParam = z.object({ shareToken: z.string().uuid() });

export default new Hono()
  // Get shared character data (public, no auth)
  .get("/characters/:shareToken", validate("param", shareTokenParam), async (c) => {
    const { shareToken } = c.req.valid("param");
    return c.json(await CharacterSharingService.getSharedCharacter(shareToken), 200);
  })
  // Generate PDF for shared character (public, no auth): a render each request, counted as the owner's exports are
  .get("/characters/:shareToken/pdf", exportRateLimit, validate("param", shareTokenParam), async (c) => {
    const { shareToken } = c.req.valid("param");
    const { data, fileName } = await CharacterSharingService.generateSharedPdf(shareToken);

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": formatContentDisposition("inline", fileName),
      },
    });
  });
