import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Inventory } from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";

/** A character's inventory. */
export default new Hono<ApiKeyContext>().get(
  "/:id/inventory",
  describeRoute({ response: v1Inventory, status: 200, summary: "A character's inventory" }),
  validate("param", idParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return c.json(V1.inventory(await CharacterInventoryService.getInventory(c.var.requestSession, id)), 200);
  },
);
