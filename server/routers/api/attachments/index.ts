import { Hono } from "hono";
import { z } from "zod";

import { attachmentUploadRateLimit, denyDemoUser, sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";

const signedIdParam = z.object({ signedId: z.string().min(1) });

export default new Hono()
  .use(sessionMiddleware)
  .get(
    "/",
    validate(
      "query",
      z.object({
        recordType: z.string().min(1),
        recordId: z.string().uuid(),
        name: z.string().min(1),
      }),
    ),
    async (c) => {
      const query = c.req.valid("query");
      return c.json(await AttachmentsService.getAttachment(c.var.requestSession, query), 200);
    },
  )
  .post(
    "/direct-uploads",
    denyDemoUser,
    attachmentUploadRateLimit,
    validate(
      "json",
      z.object({
        recordType: z.string().min(1),
        recordId: z.string().uuid(),
        name: z.string().min(1),
        filename: z.string().min(1),
        contentType: z.string().min(1),
        byteSize: z.number().int().positive(),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(await AttachmentsService.createDirectUpload(c.var.requestSession, body), 200);
    },
  )
  .post("/:signedId/attach", denyDemoUser, validate("param", signedIdParam), async (c) => {
    const { signedId } = c.req.valid("param");
    return c.json(await AttachmentsService.attach(c.var.requestSession, signedId), 200);
  })
  .delete("/:id", denyDemoUser, validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await AttachmentsService.detach(c.var.requestSession, id), 200);
  });
