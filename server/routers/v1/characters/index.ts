import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idList, idParam, orderDirDesc } from "@/server/routers/api/validation.ts";
import { v1Character, v1CharacterPage, v1LinkRoom } from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CharactersService } from "@/server/services/characters/index.ts";

import inventory from "./inventory/index.ts";
import levels from "./levels/index.ts";
import modifiers from "./modifiers/index.ts";

/** A character's links of a role, as its sheet's sections name it. */
const roleParams = idParam.extend({
  role: z.string().meta({ description: "The links' role, as a `links` entry of its sheet's sections names it" }),
});

/**
 * The key's user's characters: a page of them, one's sheet and its links of a role; its inventory, its own modifiers
 * and its levels, each a router of its own.
 */
export default new Hono<ApiKeyContext>()
  .route("/", inventory)
  .route("/", levels)
  .route("/", modifiers)
  .get(
    "/",
    describeRoute({ response: v1CharacterPage, status: 200, summary: "The key's user's characters, a page at a time" }),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        accessRole: z
          .enum(["owner", "contributor"])
          .optional()
          .meta({ description: "Only those the user owns, or only those they contribute to" }),
        orderBy: z.enum(["name", "createdAt", "lastChangedAt"]).default("lastChangedAt"),
        orderDir: orderDirDesc,
        search: z.string().optional().meta({ description: "A part of the name" }),
        visibility: z
          .enum(["active", "archived", "all"])
          .default("active")
          .meta({ description: "Its active characters, its archived ones, or both" }),
      }),
    ),
    async (c) => {
      const { accessRole, limit, orderBy, orderDir, page, search, visibility } = c.req.valid("query");
      const characters = await CharactersService.getCharacters(
        c.var.requestSession,
        { accessRole, orderBy, orderDir, search, visibility },
        { limit, page },
      );
      return c.json(V1.characters(characters), 200);
    },
  )
  .get(
    "/:id",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "A character's sheet: its sections, as the app shows them, and what the rules find wrong with it",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/links/:role",
    describeRoute({
      response: v1LinkRoom,
      status: 200,
      summary:
        "A character's links of a role, as its sheet names it: those it picked, those it has anyway, " +
        "and those it may pick",
    }),
    validate("param", roleParams),
    validate(
      "query",
      z.object({
        entityIds: idList.meta({
          description:
            "The picks being made, comma-separated, whose room it weighs: none when it's left out (the sheet's " +
            "fields section lists the character's own)",
        }),
      }),
    ),
    async (c) => {
      const { id, role } = c.req.valid("param");
      const { entityIds = [] } = c.req.valid("query");
      const room = await CharactersService.getLinkPicks(c.var.requestSession, id, role, entityIds);
      return c.json(V1.linkRoom(room), 200);
    },
  );
