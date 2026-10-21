import { Hono } from "hono";

import { RulesService } from "@/server/services/rules/index.ts";

/** What every base rules' rulesets share (public, no auth): their words, kinds and license, the same for anyone. */
export default new Hono().get("/", (c) => c.json(RulesService.getRules(), 200));
