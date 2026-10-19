import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, levelChoicesRateLimit, validate } from "@/server/middlewares/index.ts";
import { buildPickPairsSchema } from "@/server/routers/api/schemaBuilders.ts";
import { idParam, increaseList, limit, page, skillPoints } from "@/server/routers/api/validation.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

/** The key's user's characters: a page of them, one's sheet, and its choices at its next level. */
export default new Hono<ApiKeyContext>()
  .get("/", validate("query", z.object({ limit, page, search: z.string().optional() })), async (c) => {
    const { limit, page, search } = c.req.valid("query");
    const characters = await CharactersService.getCharacters(c.var.requestSession, { search }, { limit, page });
    return c.json(V1.characters(characters), 200);
  })
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
  })
  // A level's choices: the classes the character can take, and for a planned level of `classId`, what each step offers
  // with its picks so far (`abilityId:amount;…`, `skillId:points,…`, `featId:poolId,…`, `spellId:poolId,…`)
  .get(
    "/:id/level-choices",
    levelChoicesRateLimit,
    validate("param", idParam),
    validate(
      "query",
      z.object({
        abilityIncreases: increaseList.optional(),
        classId: z.string().uuid().optional(),
        feats: buildPickPairsSchema("featId"),
        skillPoints,
        spells: buildPickPairsSchema("spellId"),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const query = c.req.valid("query");
      const choices = await CharacterLevelsService.getLevelChoices(
        c.var.requestSession,
        id,
        V1.levelChoicesQuery(query),
      );
      return c.json(V1.levelChoices(choices), 200);
    },
  );
