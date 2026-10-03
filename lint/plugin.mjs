/** The repo's own lint rules, as one oxlint plugin (`arkyvree/…`): member order, and the architecture. */
import { rules as architecture } from "./architecture.mjs";
import memberOrder from "./memberOrder.mjs";

export default {
  meta: { name: "arkyvree" },
  rules: { ...memberOrder.rules, ...architecture },
};
