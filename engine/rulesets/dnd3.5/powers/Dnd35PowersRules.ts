import type { PowerFields, PowersRules } from "@/engine/rulesets/dnd3.5/module/index.ts";

import { readPowerFields } from "./powerFields.ts";

export class Dnd35PowersRules implements PowersRules {
  extractGroupingValue(fields: PowerFields): string | null {
    return typeof fields.school === "string" && fields.school.length > 0 ? fields.school : null;
  }

  readProperties(properties: { type: string; value: string }[]): PowerFields {
    return readPowerFields(properties);
  }
}
