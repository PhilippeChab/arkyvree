import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { idParam, limit, orderDirDesc, page, sanitizedEmail } from "@/server/routers/api/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import CharacterContributorsService from "@/server/services/CharacterContributorsService.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/contributors",
    zValidator("param", idParam),
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
      return respond(c, result, 200);
    },
  )
  .post(
    "/:id/contributors",
    denyDemoUser,
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        email: sanitizedEmail,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { email } = c.req.valid("json");

      const service = CharacterContributorsService.initialize();
      const result = await service.call("inviteContributor", c.var.requestSession, id, email);
      return respond(c, result, 201);
    },
  )
  .delete(
    "/:id/contributors/:contributorId",
    denyDemoUser,
    zValidator("param", z.object({ id: z.string().uuid(), contributorId: z.string().uuid() })),
    async (c) => {
      const { contributorId } = c.req.valid("param");

      const service = CharacterContributorsService.initialize();
      const result = await service.call("revokeContributor", c.var.requestSession, contributorId);
      return respond(c, result, 200);
    },
  )
  .post("/:id/contributors/leave", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    const service = CharacterContributorsService.initialize();
    const result = await service.call("leaveCharacter", c.var.requestSession, id);
    return respond(c, result, 200);
  })
  .get("/contributors/invites/me", async (c) => {
    const service = CharacterContributorsService.initialize();
    const result = await service.call("getUserContributorInvites", c.var.requestSession.userId);
    return respond(c, result, 200);
  })
  .get("/contributors/invites/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    const service = CharacterContributorsService.initialize();
    const result = await service.call("getContributorInvite", c.var.requestSession, id);
    return respond(c, result, 200);
  })
  .post("/contributors/invites/:id/accept", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    const service = CharacterContributorsService.initialize();
    const result = await service.call("acceptContributorInvite", c.var.requestSession, id);
    return respond(c, result, 200);
  })
  .post("/contributors/invites/:id/reject", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    const service = CharacterContributorsService.initialize();
    const result = await service.call("rejectContributorInvite", c.var.requestSession, id);
    return respond(c, result, 200);
  });
