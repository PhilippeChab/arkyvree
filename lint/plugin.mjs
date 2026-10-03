/**
 * The repo's own lint rules, as one oxlint plugin (`arkyvree/…`): member order, method names, the architecture and the
 * conventions.
 */
import { rules as architecture } from "./architecture.mjs";
import { rules as conventions } from "./conventions.mjs";
import memberOrder from "./memberOrder.mjs";
import { rules as methodNames } from "./methodNames.mjs";

export default {
  meta: { name: "arkyvree" },
  rules: { ...memberOrder.rules, ...methodNames, ...architecture, ...conventions },
};
