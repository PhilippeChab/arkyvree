import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, type SessionContext, validate } from "@/server/middlewares/index.ts";
import {
  contributorParams,
  idParam,
  limit,
  orderDirDesc,
  page,
  sanitizedEmail,
} from "@/server/routers/api/validation.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";

export default new Hono<SessionContext>()
  .get("/contributors/invites/me", async (c) =>
    c.json(await CharacterContributorsService.getUserInvites(c.var.requestSession.userId), 200),
  )
  .get("/contributors/invites/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharacterContributorsService.getInvite(c.var.requestSession, id), 200);
  })
  .get(
    "/:id/contributors",
    validate("param", idParam),
    validate(
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
  .post("/contributors/invites/:id/accept", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharacterContributorsService.acceptInvite(c.var.requestSession, id), 200);
  })
  .post("/contributors/invites/:id/reject", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharacterContributorsService.rejectInvite(c.var.requestSession, id), 200);
  })
  .post(
    "/:id/contributors",
    denyDemoUser,
    validate("param", idParam),
    validate(
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
  .post("/:id/contributors/leave", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharacterContributorsService.leaveCharacter(c.var.requestSession, id), 200);
  })
  .delete("/:id/contributors/:contributorId", denyDemoUser, validate("param", contributorParams), async (c) => {
    const { contributorId } = c.req.valid("param");
    return c.json(await CharacterContributorsService.revokeContributor(c.var.requestSession, contributorId), 200);
  });
