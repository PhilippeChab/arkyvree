import { Hono } from "hono";
import activities from "./activities/index.ts";
import attachments from "./attachments/index.ts";
import campaigns from "./campaigns/index.ts";
import characters from "./characters/index.tsx";
import dashboard from "./dashboard/index.ts";
import demo from "./demo/index.ts";
import exports from "./exports/index.ts";
import feedback from "./feedback/index.ts";
import notifications from "./notifications/index.ts";
import rulesets from "./rulesets/index.ts";
import shared from "./shared/index.tsx";

const api = new Hono()
  // Mount API routes with proper chaining for type safety
  .route("/shared", shared)
  .route("/activities", activities)
  .route("/attachments", attachments)
  .route("/characters", characters)
  .route("/dashboard", dashboard)
  .route("/demo", demo)
  .route("/exports", exports)
  .route("/feedback", feedback)
  .route("/notifications", notifications)
  .route("/rulesets", rulesets)
  .route("/campaigns", campaigns);

export default api;
