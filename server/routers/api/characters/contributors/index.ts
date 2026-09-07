import { toJson } from "@/server/errors/index.ts";
import { denyDemoUser, type SessionContext } from "@/server/middlewares/index.ts";
import CharacterContributorsService from "@/server/services/CharacterContributorsService.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { sanitizeEmail } from "@/shared/utils.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/contributors",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
        orderDir: orderDirDesc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, orderBy, orderDir } = c.req.valid("query");

      const service = CharacterContributorsService.initialize();
      const result = await service.call(
        "getContributors",
        c.var.requestSession,
        id,
        { search, orderBy, orderDir },
        { limit, page },
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/contributors",
    denyDemoUser,
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        email: z.string().email().transform(sanitizeEmail),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { email } = c.req.valid("json");

      const service = CharacterContributorsService.initialize();
      const result = await service.call(
        "inviteContributor",
        c.var.requestSession,
        id,
        email,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  )
  .delete(
    "/:id/contributors/:contributorId",
    denyDemoUser,
    zValidator("param", z.object({ id: z.string().uuid(), contributorId: z.string().uuid() })),
    async (c) => {
      const { contributorId } = c.req.valid("param");

      const service = CharacterContributorsService.initialize();
      const result = await service.call(
        "revokeContributor",
        c.var.requestSession,
        contributorId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/contributors/leave",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const service = CharacterContributorsService.initialize();
      const result = await service.call(
        "leaveCharacter",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/contributors/invites/me",
    async (c) => {
      const service = CharacterContributorsService.initialize();
      const result = await service.call(
        "getUserContributorInvites",
        c.var.requestSession.userId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/contributors/invites/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const service = CharacterContributorsService.initialize();
      const result = await service.call(
        "getContributorInvite",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/contributors/invites/:id/accept",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const service = CharacterContributorsService.initialize();
      const result = await service.call(
        "acceptContributorInvite",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/contributors/invites/:id/reject",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const service = CharacterContributorsService.initialize();
      const result = await service.call(
        "rejectContributorInvite",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
