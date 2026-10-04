import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, sessionMiddleware, zValidator } from "@/server/middlewares/index.ts";
import { idParam, limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";

import playerCharacters from "./characters/index.ts";
import invites from "./invites/index.ts";
import players from "./players/index.ts";

export default new Hono()
  .use(sessionMiddleware)
  .route("/", players)
  .route("/", invites)
  .route("/", playerCharacters)
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        limit,
        page,
        visibility: z.enum(["all", "archived", "active"]).default("active"),
        search: z.string().optional(),
        orderBy: z.enum(["name", "createdAt", "updatedAt"]).default("createdAt"),
        orderDir: orderDirDesc,
      }),
    ),
    async (c) => {
      const query = c.req.valid("query");

      return c.json(
        await CampaignsService.getCampaigns(
          c.var.requestSession,
          { visibility: query.visibility, search: query.search, orderBy: query.orderBy, orderDir: query.orderDir },
          { limit: query.limit, page: query.page },
        ),
        200,
      );
    },
  )
  .get("/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    return c.json(await CampaignsService.getCampaign(c.var.requestSession, id), 200);
  })
  .post(
    "/",
    denyDemoUser,
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        rulesetId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const data = c.req.valid("json");

      return c.json(await CampaignsService.createCampaign(c.var.requestSession, data), 201);
    },
  )
  .post("/:id/unarchive", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CampaignsService.unarchiveCampaign(c.var.requestSession, id);
    return c.json({ message: "Campaign unarchived successfully" }, 200);
  })
  .put(
    "/:id",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const data = c.req.valid("json");

      return c.json(await CampaignsService.updateCampaign(c.var.requestSession, id, data), 200);
    },
  )
  .delete("/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CampaignsService.archiveCampaign(c.var.requestSession, id);
    return c.json({ message: "Campaign archived successfully" }, 200);
  })
  .delete("/:id/permanent", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CampaignsService.hardDeleteCampaign(c.var.requestSession, id);
    return c.json({ message: "Campaign permanently deleted" }, 200);
  });
