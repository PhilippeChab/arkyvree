import { toJson } from "@/server/errors/index.ts";
import { sessionMiddleware } from "@/server/middlewares/index.ts";
import ExportsService from "@/server/services/ExportsService.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const exports = new Hono()
  .use(sessionMiddleware)
  .get(
    "/:id/download",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await ExportsService.initialize().call(
        "download",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      const exportRecord = result[1];

      return new Response(new Uint8Array(exportRecord.data), {
        headers: {
          "Content-Type": exportRecord.mimeType,
          "Content-Disposition": `attachment; filename="${exportRecord.fileName}"`,
        },
      });
    },
  );

export default exports;
