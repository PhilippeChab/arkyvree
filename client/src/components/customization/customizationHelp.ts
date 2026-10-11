/** What each customization tab is, and a condition's template: its help, wherever it shows. */

import { TEMPLATE_FUNCTIONS } from "@/shared/customization/templateExpression.ts";

export const MODIFIERS_HELP =
  "Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc.";

export const PROPERTIES_HELP =
  "Properties are additional attributes that can be applied to entities, providing extra characteristics or metadata.";

export const REQUIREMENTS_HELP =
  "Requirements are conditions that entities must meet to be usable/available. Examples include character level requirements, feat prerequisites, etc.";

/** A condition's template: what it reads, and the functions it calls (`TEMPLATE_FUNCTIONS`, every one). */
export const TEMPLATE_HELP = `Compute the value from another path or an expression. Wrap paths in [brackets] and use ${Object.keys(TEMPLATE_FUNCTIONS).join("/")} plus +-*/ for arithmetic. Examples: [abilities.charisma.modifier], floor([classes.ranger.level] / 2), max(0, [classes.beastmaster.level] + 3).`;
