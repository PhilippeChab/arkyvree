import { RACE_QUADRUPED } from "@/vocabulary/pf1/fields/index.ts";

import type { RaceFields } from "./types.ts";

/** A four-legged race's fields: it carries more for its size than a biped does (the Core Rulebook). */
export const QUADRUPED_FIELDS: RaceFields = { [RACE_QUADRUPED]: true };
