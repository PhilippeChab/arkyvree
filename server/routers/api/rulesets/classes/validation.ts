import { z } from "zod";

import { idParam } from "@/server/routers/api/validation.ts";

/** A class route's `:id` (the ruleset) and `:classId` */
export const classParams = idParam.extend({ classId: z.string().uuid() });
