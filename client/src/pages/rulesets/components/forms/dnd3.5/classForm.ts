import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { ClassDetail } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { DEFAULT_HIT_DIE, HIT_DIE_VALUES } from "@/vocabulary/dnd3.5/classes.ts";

import type { ClassFormData } from "./ClassFormFields.tsx";

/** The form values of an existing class: its hit die one of the rules', a new class's when it holds none. */
export function toClassForm(klass: Pick<ClassDetail, "name" | "description" | "hd">): ClassFormData {
  return {
    name: klass.name,
    description: klass.description ?? "",
    hd: oneOf(klass.hd, HIT_DIE_VALUES, DEFAULT_HIT_DIE),
  };
}
