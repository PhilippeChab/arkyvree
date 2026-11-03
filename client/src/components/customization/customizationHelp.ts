/** A condition's template: its help, wherever it shows; a customization tab's is its rules' (`RulesDescription.help`). */

import { TEMPLATE_FUNCTIONS } from "@/shared/customization/templateExpression.ts";

/**
 * A condition's template: what it reads, the functions it calls (`TEMPLATE_FUNCTIONS`, every one), and its rules' paths
 * as examples (`examples`: `RulesDescription.help.templateExamples`), none until they're in.
 */
export function templateHelp(examples: string | undefined) {
  const intro = `Compute the value from another path or an expression. Wrap paths in [brackets] and use ${Object.keys(TEMPLATE_FUNCTIONS).join("/")} plus +-*/ for arithmetic.`;
  return examples ? `${intro} Examples: ${examples}.` : intro;
}
