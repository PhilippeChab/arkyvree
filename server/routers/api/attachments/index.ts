import { Hono } from "hono";
import { z } from "zod";

import { attachmentUploadRateLimit, denyDemoUser, sessionMiddleware, zValidator } from "@/server/middlewares/index.ts";
import { respond } from "@/server/routers/respond.ts";
import AttachmentsService from "@/server/services/AttachmentsService.ts";

const directUploadBody = z.object({
  recordType: z.string().min(1),
  recordId: z.string().uuid(),
  name: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().positive(),
});

const attachments = new Hono()
  .use(sessionMiddleware)
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        recordType: z.string().min(1),
        recordId: z.string().uuid(),
        name: z.string().min(1),
      }),
    ),
    async (c) => {
      const params = c.req.valid("query");
      const result = await AttachmentsService.initialize().call("findOne", c.var.requestSession, params);
      return respond(c, result, 200);
    },
  )
  .post("/direct-uploads", denyDemoUser, attachmentUploadRateLimit, zValidator("json", directUploadBody), async (c) => {
    const params = c.req.valid("json");
    const result = await AttachmentsService.initialize().call("createDirectUpload", c.var.requestSession, params);
    return respond(c, result, 200);
  })
  .post(
    "/:signedId/attach",
    denyDemoUser,
    zValidator("param", z.object({ signedId: z.string().min(1) })),
    async (c) => {
      const { signedId } = c.req.valid("param");
      const result = await AttachmentsService.initialize().call("attach", c.var.requestSession, signedId);
      return respond(c, result, 200);
    },
  )
  .delete("/:id", denyDemoUser, zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    const { id } = c.req.valid("param");
    const result = await AttachmentsService.initialize().call("detach", c.var.requestSession, id);
    return respond(c, result, 200);
  });

export default attachments;
