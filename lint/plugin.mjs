/**
 * The repo's own lint rules, as one oxlint plugin (`arkyvree/…`): member order, method names, the architecture, the
 * backend's conventions, a file's layout, the client's, its styles, its shared components, its controls, its wording
 * and its feedback, the tests', and where a module keeps its state.
 */

import architecture from "./architecture.mjs";
import comments from "./comments.mjs";
import components from "./components.mjs";
import controls from "./controls.mjs";
import conventions from "./conventions.mjs";
import feedback from "./feedback.mjs";
import frontend from "./frontend.mjs";
import layout from "./layout.mjs";
import memberOrder from "./memberOrder.mjs";
import methodNames from "./methodNames.mjs";
import moduleState from "./moduleState.mjs";
import size from "./size.mjs";
import styles from "./styles.mjs";
import testing from "./testing.mjs";
import wording from "./wording.mjs";

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
    ...controls,
    ...wording,
    ...feedback,
    ...testing,
    ...size,
    ...moduleState,
  },
};
