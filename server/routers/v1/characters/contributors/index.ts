import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { contributorParams, idParam, orderDirDesc, sanitizedEmail } from "@/server/routers/api/validation.ts";
import { v1Contributor, v1ContributorPage } from "@/server/routers/v1/schemas/contributors.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";

/**
 * A player character's contributors, who edit it with its owner: a page of them, an invite, a removal, and the key's
 * user's leaving. Its owner manages them; its contributors read them.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/contributors",
    describeRoute({
      response: v1ContributorPage,
      status: 200,
      summary: "A character's contributors and pending invites, a page at a time, with its owner",
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
      const contributors = await CharacterContributorsService.getContributors(
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
      summary: "Invites an address to contribute to a character, as its owner: its user, or whoever signs up with it",
    }),
    validate("param", idParam),
    validate("json", z.object({ email: sanitizedEmail })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { email } = c.req.valid("json");
      const contributor = await CharacterContributorsService.inviteContributor(c.var.requestSession, id, email);
      return c.json(V1.contributor(contributor), 201);
    },
  )
  .post(
    "/:id/contributors/leave",
    describeRoute({
      response: null,
      status: 204,
      summary: "The key's user stops contributing to a character",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CharacterContributorsService.leaveCharacter(c.var.requestSession, id);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/contributors/:contributorId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Removes a contributor, or takes back a pending invite, as the character's owner",
    }),
    validate("param", contributorParams),
    async (c) => {
      const { contributorId, id } = c.req.valid("param");
      await CharacterContributorsService.revokeContributor(c.var.requestSession, id, contributorId);
      return c.body(null, 204);
    },
  );
