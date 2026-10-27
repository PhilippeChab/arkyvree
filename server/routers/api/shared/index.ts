import { Hono } from "hono";
import { z } from "zod";

import { exportRateLimit, validate } from "@/server/middlewares/index.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

const shareTokenParam = z.object({ shareToken: z.string().uuid() });

/**
 * A file shown in the browser, by its name whatever its characters: a header holds Latin-1 alone, so the name is sent
 * percent-encoded as UTF-8 (RFC 6266's `filename*`, which leaves `'`, `(` and `)` encoded too).
 */
function inlineDisposition(fileName: string) {
  const encoded = encodeURIComponent(fileName).replace(
    /['()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename*=UTF-8''${encoded}`;
}

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
      headers: { "Content-Type": "application/pdf", "Content-Disposition": inlineDisposition(fileName) },
    });
  });
