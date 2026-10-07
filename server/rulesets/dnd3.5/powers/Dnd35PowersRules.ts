import type { PowerBody, PowersRules } from "@/server/rulesets/engine/module/index.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";

import { SPELL_FIELD_PROPERTY_TYPES } from "./spellGenerator.ts";

export class Dnd35PowersRules implements PowersRules {
  readonly primaryGroupingType = SPELL_SCHOOL;

  readonly generatedPropertyTypes = SPELL_FIELD_PROPERTY_TYPES;

  extractGroupingValue(body: PowerBody): string | null {
    return typeof body.school === "string" && body.school.length > 0 ? body.school : null;
  }
}
