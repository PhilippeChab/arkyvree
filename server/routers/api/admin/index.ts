import { Hono } from "hono";
import { z } from "zod";

import { sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";
import { InstanceService } from "@/server/services/instance/index.ts";
import { SIGN_UP_POLICIES } from "@/shared/enums.ts";
import { INVITE_LINK_LIFETIMES_IN_DAYS } from "@/shared/inviteLinks.ts";

/**
 * What the instance's admins run: who may make an account (its sign-up setting), the invite links that let people sign
 * up, and its accounts, made admins, deactivated and reactivated, their email marked verified. Anyone else is refused
 * (403).
 */
export default new Hono()
  .use(sessionMiddleware)
  .get("/accounts", validate("query", z.object({ limit, page, search: z.string().optional() })), async (c) => {
    const { limit, page, search } = c.req.valid("query");
    return c.json(await InstanceService.getAccounts(c.var.requestSession, { search }, { limit, page }), 200);
  })
  .get("/invite-links", validate("query", z.object({ limit, page })), async (c) => {
    const { limit, page } = c.req.valid("query");
    return c.json(await InstanceService.getInviteLinks(c.var.requestSession, { limit, page }), 200);
  })
  .get("/settings", async (c) => c.json(await InstanceService.getSettings(c.var.requestSession), 200))
  .post("/accounts/:id/verify-email", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await InstanceService.markAccountVerified(c.var.requestSession, id), 200);
  })
  .post(
    "/invite-links",
    // Its lifetime in days: a day, a week or a month
    validate(
      "json",
      z.object({ expiresInDays: z.union(INVITE_LINK_LIFETIMES_IN_DAYS.map((days) => z.literal(days))) }),
    ),
    async (c) => {
      const { expiresInDays } = c.req.valid("json");
      return c.json(await InstanceService.createInviteLink(c.var.requestSession, expiresInDays), 201);
    },
  )
  .post("/invite-links/:id/revoke", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await InstanceService.revokeInviteLink(c.var.requestSession, id), 200);
  })
  .put(
    "/accounts/:id/admin",
    validate("param", idParam),
    validate("json", z.object({ isAdmin: z.boolean() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { isAdmin } = c.req.valid("json");
      return c.json(await InstanceService.setAccountAdmin(c.var.requestSession, id, isAdmin), 200);
    },
  )
  .put(
    "/accounts/:id/deactivated",
    validate("param", idParam),
    validate("json", z.object({ deactivated: z.boolean() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { deactivated } = c.req.valid("json");
      return c.json(await InstanceService.setAccountDeactivated(c.var.requestSession, id, deactivated), 200);
    },
  )
  .put("/settings", validate("json", z.object({ signUpPolicy: z.enum(SIGN_UP_POLICIES) })), async (c) => {
    const { signUpPolicy } = c.req.valid("json");
    return c.json(await InstanceService.updateSettings(c.var.requestSession, signUpPolicy), 200);
  });
