/**
 * The repo's own lint rules, as one oxlint plugin (`arkyvree/…`): member order, method names, the architecture, the
 * backend's conventions, a file's layout, the client's, its styles, its shared components and the tests', and where a module keeps its state.
 */

import architecture from "./architecture.mjs";
import comments from "./comments.mjs";
import components from "./components.mjs";
import conventions from "./conventions.mjs";
import frontend from "./frontend.mjs";
import layout from "./layout.mjs";
import memberOrder from "./memberOrder.mjs";
import methodNames from "./methodNames.mjs";
import moduleState from "./moduleState.mjs";
import size from "./size.mjs";
import styles from "./styles.mjs";
import testing from "./testing.mjs";

export default {
  meta: { name: "arkyvree" },
  rules: {
    ...memberOrder.rules,
    ...comments,
    ...methodNames,
    ...architecture,
    ...conventions,
    ...layout,
    ...frontend,
    ...styles,
    ...components,
    ...testing,
    ...size,
    ...moduleState,
  },
};
