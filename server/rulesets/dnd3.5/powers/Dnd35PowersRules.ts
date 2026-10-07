import type { PowerFields, PowersRules } from "@/server/rulesets/engine/module/index.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";

export class Dnd35PowersRules implements PowersRules {
  readonly primaryGroupingType = SPELL_SCHOOL;

  extractGroupingValue(fields: PowerFields): string | null {
    return typeof fields.school === "string" && fields.school.length > 0 ? fields.school : null;
  }
}
