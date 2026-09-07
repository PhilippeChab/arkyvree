import { toJson } from "@/server/errors/index.ts";
import { denyDemoUser, sessionMiddleware } from "@/server/middlewares/index.ts";
import { visibilityMap } from "@/server/repositories/BaseRepository.ts";
import CampaignsService from "@/server/services/CampaignsService.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
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

      const visibility = visibilityMap[query.visibility];

      const result = await CampaignsService.initialize().call(
        "getMyCampaigns",
        c.var.requestSession,
        { visibility, search: query.search, orderBy: query.orderBy, orderDir: query.orderDir },
        { limit: query.limit, page: query.page },
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
    "/:id/unarchive",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await CampaignsService.initialize().call(
        "unarchiveCampaign",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "Campaign unarchived successfully" }, 200);
    },
  )
  .get("/:id", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    const { id } = c.req.valid("param");

    const result = await CampaignsService.initialize().call("getCampaignById", c.var.requestSession, id);
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  }).post(
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

      const result = await CampaignsService.initialize().call(
        "createCampaign",
        c.var.requestSession,
        data,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  ).put(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
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

      const result = await CampaignsService.initialize().call(
        "updateCampaign",
        c.var.requestSession,
        id,
        data,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  ).delete("/:id", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    const { id } = c.req.valid("param");

    const result = await CampaignsService.initialize().call(
      "archiveCampaign",
      c.var.requestSession,
      id,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json({ message: "Campaign archived successfully" }, 200);
  })
  .delete(
    "/:id/permanent",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await CampaignsService.initialize().call(
        "hardDeleteCampaign",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "Campaign permanently deleted" }, 200);
    },
  );
