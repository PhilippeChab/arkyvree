import { Hono } from "hono";
import { z } from "zod";

import { contributorRole } from "@/drizzle/schema.ts";
import { denyDemoUser, type SessionContext, validate } from "@/server/middlewares/index.ts";
import {
  contributorParams,
  idParam,
  limit,
  orderDirDesc,
  page,
  sanitizedEmail,
} from "@/server/routers/api/validation.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";

const contributorRoleSchema = z.enum(contributorRole.enumValues);

export default new Hono<SessionContext>()
  .get("/contributors/invites/me", async (c) => {
    return c.json(await ContributorsService.getUserInvites(c.var.requestSession.userId), 200);
  })
  .get("/contributors/invites/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await ContributorsService.getInvite(c.var.requestSession, id), 200);
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
        await ContributorsService.getContributors(
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
    return c.json(await ContributorsService.acceptInvite(c.var.requestSession, id), 200);
  })
  .post("/contributors/invites/:id/reject", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await ContributorsService.rejectInvite(c.var.requestSession, id), 200);
  })
  .post(
    "/:id/contributors",
    denyDemoUser,
    validate("param", idParam),
    validate(
      "json",
      z.object({
        email: sanitizedEmail,
        role: contributorRoleSchema.default("Editor"),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { email, role } = c.req.valid("json");
      return c.json(await ContributorsService.inviteContributor(c.var.requestSession, id, email, role), 201);
    },
  )
  .post("/:id/contributors/leave", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await ContributorsService.leaveRuleset(c.var.requestSession, id), 200);
  })
  .put(
    "/:id/contributors/:contributorId",
    validate("param", contributorParams),
    validate(
      "json",
      z.object({
        role: contributorRoleSchema,
      }),
    ),
    async (c) => {
      const { contributorId } = c.req.valid("param");
      const { role } = c.req.valid("json");
      return c.json(await ContributorsService.updateContributorRole(c.var.requestSession, contributorId, role), 200);
    },
  )
  .delete("/:id/contributors/:contributorId", denyDemoUser, validate("param", contributorParams), async (c) => {
    const { contributorId } = c.req.valid("param");
    return c.json(await ContributorsService.revokeContributor(c.var.requestSession, contributorId), 200);
  });
