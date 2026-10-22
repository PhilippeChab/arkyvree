import { Hono } from "hono";

import type { SessionContext } from "@/server/middlewares/index.ts";

import classLevels from "./levels/index.ts";
import classProgression from "./progression/index.ts";
import classSkills from "./skills/index.ts";

export default new Hono<SessionContext>()
  .route("/", classLevels)
  .route("/", classProgression)
  .route("/", classSkills);
