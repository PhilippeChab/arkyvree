import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/index.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:characterId/modifiers",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const result = await CharacterModifiersService.initialize().call("getModifiers", c.var.requestSession, characterId);
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1], 200);
    },
  )
  .post(
    "/:characterId/modifiers",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator("json", z.object({
      target: z.string().min(1),
      value: z.string().min(1),
      operator: z.string().min(1),
    })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await CharacterModifiersService.initialize().call("createModifier", c.var.requestSession, characterId, body);
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1], 201);
    },
  )
  .put(
    "/:characterId/modifiers/:modifierId",
    zValidator("param", z.object({ characterId: z.string().uuid(), modifierId: z.string().uuid() })),
    zValidator("json", z.object({
      target: z.string().min(1),
      value: z.string().min(1),
      operator: z.string().min(1),
      updatedAt: z.string().optional(),
    })),
    async (c) => {
      const { characterId, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await CharacterModifiersService.initialize().call("updateModifier", c.var.requestSession, characterId, modifierId, body);
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1], 200);
    },
  )
  .delete(
    "/:characterId/modifiers/:modifierId",
    zValidator("param", z.object({ characterId: z.string().uuid(), modifierId: z.string().uuid() })),
    async (c) => {
      const { characterId, modifierId } = c.req.valid("param");
      const result = await CharacterModifiersService.initialize().call("deleteModifier", c.var.requestSession, characterId, modifierId);
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1], 200);
    },
  );
