/**
 * The repo's own lint rules, as one oxlint plugin (`arkyvree/…`): member order, method names, the architecture, the
 * backend's conventions, a file's layout, the client's and the tests'.
 */
import architecture from "./architecture.mjs";
import conventions from "./conventions.mjs";
import frontend from "./frontend.mjs";
import layout from "./layout.mjs";
import memberOrder from "./memberOrder.mjs";
import methodNames from "./methodNames.mjs";
import size from "./size.mjs";
import testing from "./testing.mjs";

export default {
  meta: { name: "arkyvree" },
  rules: {
    ...memberOrder.rules,
    ...methodNames,
    ...architecture,
    ...conventions,
    ...layout,
    ...frontend,
    ...testing,
    ...size,
  },
};
