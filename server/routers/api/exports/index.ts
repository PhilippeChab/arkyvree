import { Hono } from "hono";

import { sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { buildFileHeaders } from "@/server/routers/fileHeaders.ts";
import { ExportsService } from "@/server/services/exports/index.ts";

export default new Hono().use(sessionMiddleware).get("/:id/download", validate("param", idParam), async (c) => {
  const { id } = c.req.valid("param");

  const exportRecord = await ExportsService.getExport(c.var.requestSession, id);

  const { fileName, mimeType } = exportRecord;
  return new Response(new Uint8Array(exportRecord.data), {
    headers: buildFileHeaders({ disposition: "attachment", fileName, mimeType }),
  });
});
