import { Hono } from "hono";

import { sessionMiddleware, zValidator } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { ExportsService } from "@/server/services/exports/index.ts";

const exports = new Hono().use(sessionMiddleware).get("/:id/download", zValidator("param", idParam), async (c) => {
  const { id } = c.req.valid("param");

  const exportRecord = await ExportsService.getExport(c.var.requestSession, id);

  return new Response(new Uint8Array(exportRecord.data), {
    headers: {
      "Content-Type": exportRecord.mimeType,
      "Content-Disposition": `attachment; filename="${exportRecord.fileName}"`,
    },
  });
});

export default exports;
