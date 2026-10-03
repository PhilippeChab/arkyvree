import { Hono } from "hono";

import { sessionMiddleware, zValidator } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { errorResponse } from "@/server/routers/respond.ts";
import ExportsService from "@/server/services/ExportsService.ts";

const exports = new Hono().use(sessionMiddleware).get("/:id/download", zValidator("param", idParam), async (c) => {
  const { id } = c.req.valid("param");

  const result = await ExportsService.initialize().call("download", c.var.requestSession, id);
  const success = result[0];

  if (!success) return errorResponse(c, result[2]);

  const exportRecord = result[1];

  return new Response(new Uint8Array(exportRecord.data), {
    headers: {
      "Content-Type": exportRecord.mimeType,
      "Content-Disposition": `attachment; filename="${exportRecord.fileName}"`,
    },
  });
});

export default exports;
