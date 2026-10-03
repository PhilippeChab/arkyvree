/**
 * The repo's own lint rules, as one oxlint plugin (`arkyvree/…`): member order, method names, the architecture, the
 * backend's conventions, the client's and the tests'.
 */
import { rules as architecture } from "./architecture.mjs";
import { rules as conventions } from "./conventions.mjs";
import { rules as frontend } from "./frontend.mjs";
import memberOrder from "./memberOrder.mjs";
import { rules as methodNames } from "./methodNames.mjs";
import { rules as size } from "./size.mjs";
import { rules as testing } from "./testing.mjs";

export default {
  meta: { name: "arkyvree" },
  rules: { ...memberOrder.rules, ...methodNames, ...architecture, ...conventions, ...frontend, ...testing, ...size },
};
