/** The repo's own lint rules, as one oxlint plugin (`arkyvree/…`): member order, method names, and the architecture. */
import { rules as architecture } from "./architecture.mjs";
import memberOrder from "./memberOrder.mjs";
import { rules as methodNames } from "./methodNames.mjs";

export default {
  meta: { name: "arkyvree" },
  rules: { ...memberOrder.rules, ...methodNames, ...architecture },
};
