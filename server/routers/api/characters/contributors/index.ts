import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { idParam, limit, orderDirDesc, page, sanitizedEmail } from "@/server/routers/api/validation.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";

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
      return c.json(
        await CharacterContributorsService.getContributors(
          c.var.requestSession,
          id,
          { search, orderBy, orderDir },
          { limit, page },
        ),
        200,
      );
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
      return c.json(await CharacterContributorsService.inviteContributor(c.var.requestSession, id, email), 201);
    },
  )
  .delete(
    "/:id/contributors/:contributorId",
    denyDemoUser,
    zValidator("param", z.object({ id: z.string().uuid(), contributorId: z.string().uuid() })),
    async (c) => {
      const { contributorId } = c.req.valid("param");
      return c.json(await CharacterContributorsService.revokeContributor(c.var.requestSession, contributorId), 200);
    },
  )
  .post("/:id/contributors/leave", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharacterContributorsService.leaveCharacter(c.var.requestSession, id), 200);
  })
  .get("/contributors/invites/me", async (c) => {
    return c.json(await CharacterContributorsService.getUserContributorInvites(c.var.requestSession.userId), 200);
  })
  .get("/contributors/invites/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharacterContributorsService.getContributorInvite(c.var.requestSession, id), 200);
  })
  .post("/contributors/invites/:id/accept", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharacterContributorsService.acceptContributorInvite(c.var.requestSession, id), 200);
  })
  .post("/contributors/invites/:id/reject", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharacterContributorsService.rejectContributorInvite(c.var.requestSession, id), 200);
  });
