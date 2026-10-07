import type { Property } from "@/content/dnd3.5/builders/customization/types.ts";
import { RACE_QUADRUPED } from "@/shared/dnd3.5/properties/index.ts";

/** A four-legged race's properties: it carries more for its size than a biped does (SRD). */
export const QUADRUPED: Property[] = [{ type: RACE_QUADRUPED, value: "true" }];
