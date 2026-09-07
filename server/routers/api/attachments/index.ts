import { toJson } from "@/server/errors/index.ts";
import { attachmentUploadRateLimit, denyDemoUser, sessionMiddleware } from "@/server/middlewares/index.ts";
import AttachmentsService from "@/server/services/AttachmentsService.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

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
      const result = await AttachmentsService.initialize().call(
        "findOne",
        c.var.requestSession,
        params,
      );
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1]);
    },
  )
  .post(
    "/direct-uploads",
    denyDemoUser,
    attachmentUploadRateLimit,
    zValidator("json", directUploadBody),
    async (c) => {
      const params = c.req.valid("json");
      const result = await AttachmentsService.initialize().call(
        "createDirectUpload",
        c.var.requestSession,
        params,
      );
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1]);
    },
  )
  .post(
    "/:signedId/attach",
    denyDemoUser,
    zValidator("param", z.object({ signedId: z.string().min(1) })),
    async (c) => {
      const { signedId } = c.req.valid("param");
      const result = await AttachmentsService.initialize().call(
        "attach",
        c.var.requestSession,
        signedId,
      );
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1]);
    },
  )
  .delete(
    "/:id",
    denyDemoUser,
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await AttachmentsService.initialize().call(
        "detach",
        c.var.requestSession,
        id,
      );
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1]);
    },
  );

export default attachments;
