import { Hono } from "hono";

import { apiExportRateLimit, type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Export } from "@/server/routers/v1/schemas/exports.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharactersService } from "@/server/services/characters/index.ts";

/** A character's PDF, made in the background: queued as an export, which `GET /v1/exports/{id}` follows. */
export default new Hono<ApiKeyContext>().post(
  "/:id/pdf",
  describeRoute({
    response: v1Export,
    status: 202,
    summary:
      "Queues a character's PDF, as its owner or a contributor: its export, pending, which `GET /v1/exports/{id}` " +
      "answers until it's ready",
  }),
  apiExportRateLimit,
  validate("param", idParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return c.json(V1.export(await CharactersService.enqueuePdf(c.var.requestSession, id)), 202);
  },
);
