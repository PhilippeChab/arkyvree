import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Export } from "@/server/routers/v1/schemas/exports.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { ExportsService } from "@/server/services/exports/index.ts";

/**
 * The files the app makes for the key's user in the background, a character's PDF: whether one is ready, and its
 * file once it is. Its queueing (`POST /v1/characters/{id}/pdf`) answers its id.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id",
    describeRoute({
      response: v1Export,
      status: 200,
      summary: "Where an export of the key's user's stands: `pending` while it's made, `ready`, or `failed`",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.export(await ExportsService.getExportStatus(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/download",
    describeRoute({
      file: "application/pdf",
      response: null,
      status: 200,
      summary: "An export's file, once it's ready (a pending or failed one is a 409), for the hour it's kept",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      const { data, fileName, mimeType } = await ExportsService.getExport(c.var.requestSession, id);
      return c.body(new Uint8Array(data), 200, {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": mimeType,
      });
    },
  );
