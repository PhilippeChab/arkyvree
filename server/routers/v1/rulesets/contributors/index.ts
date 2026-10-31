import { Hono } from "hono";
import { z } from "zod";

import { contributorRole } from "@/drizzle/schema.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { contributorParams, idParam, orderDirDesc, sanitizedEmail } from "@/server/routers/api/validation.ts";
import { v1Contributor, v1ContributorPage } from "@/server/routers/v1/schemas/contributors.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";

/**
 * A ruleset's contributors, each in a role: a page of them, an invite, a change of role, a removal, and the key's
 * user's leaving. Its owner and its admins manage them (an admin's role its owner alone); its contributors read them.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/contributors",
    describeRoute({
      response: v1ContributorPage,
      status: 200,
      summary: "A ruleset's contributors and pending invites, a page at a time, with its owner",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
        orderDir: orderDirDesc,
        search: z.string().optional().meta({ description: "A part of the address, or of the user's name" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const contributors = await ContributorsService.getContributors(
        c.var.requestSession,
        id,
        { orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.contributors(contributors), 200);
    },
  )
  .post(
    "/:id/contributors",
    describeRoute({
      response: v1Contributor,
      status: 201,
      summary: "Invites an address to contribute to a ruleset in a role: its user, or whoever signs up with it",
    }),
    validate("param", idParam),
    validate(
      "json",
      z.object({
        email: sanitizedEmail,
        role: z.enum(contributorRole.enumValues).default("Editor"),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { email, role } = c.req.valid("json");
      return c.json(
        V1.contributor(await ContributorsService.inviteContributor(c.var.requestSession, id, email, role)),
        201,
      );
    },
  )
  .post(
    "/:id/contributors/leave",
    describeRoute({ response: null, status: 204, summary: "The key's user stops contributing to a ruleset" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await ContributorsService.leaveRuleset(c.var.requestSession, id);
      return c.body(null, 204);
    },
  )
  .put(
    "/:id/contributors/:contributorId",
    describeRoute({ response: v1Contributor, status: 200, summary: "Changes an active contributor's role" }),
    validate("param", contributorParams),
    validate("json", z.object({ role: z.enum(contributorRole.enumValues) })),
    async (c) => {
      const { contributorId, id } = c.req.valid("param");
      const { role } = c.req.valid("json");
      const contributor = await ContributorsService.updateContributorRole(
        c.var.requestSession,
        id,
        contributorId,
        role,
      );
      return c.json(V1.contributor(contributor), 200);
    },
  )
  .delete(
    "/:id/contributors/:contributorId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Removes a contributor, or takes back a pending invite",
    }),
    validate("param", contributorParams),
    async (c) => {
      const { contributorId, id } = c.req.valid("param");
      await ContributorsService.revokeContributor(c.var.requestSession, id, contributorId);
      return c.body(null, 204);
    },
  );
