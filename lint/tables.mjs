/**
 * What the server and the shared code name a stored row by:
 *
 * - `table-names`: the server and `shared/` name no table (`getTableName`): what they name is a kind, an entity's type,
 *   or a target type (`TARGET_TYPES`), in the form a route names it.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { isInRepo, repoPath } from "./paths.mjs";

/** The name that reads a table's: drizzle's `getTableName`. */
const TABLE_NAME = "getTableName";

/** The folders that name no table: the server and the shared code name kinds and target types. */
const TABLELESS_FOLDERS = [/^server\//, /^shared\//];

/** `table-names`: a table's name read in the server or `shared/` (`getTableName`), by name or by a computed member. */
function createTableNames(context) {
  if (!isInRepo(context.filename)) return {};
  if (!TABLELESS_FOLDERS.some((folder) => folder.test(repoPath(context.filename)))) return {};
  // A name read twice at one place (an import's imported and local name) is reported once
  const reported = new Set();
  const report = (node) => {
    if (reported.has(node.start)) return;
    reported.add(node.start);
    context.report({
      node,
      message:
        "The server and `shared/` name no table (`getTableName`): an activity's target is an entity's type or one " +
        "of `TARGET_TYPES`, in the form a route names a kind.",
    });
  };
  return {
    Identifier(node) {
      if (node.name === TABLE_NAME) report(node);
    },
    Literal(node) {
      const { parent } = node;
      if (
        node.value === TABLE_NAME &&
        parent?.type === "MemberExpression" &&
        parent.computed &&
        parent.property === node
      )
        report(node);
    },
  };
}

export default {
  "table-names": { meta: { type: "problem" }, create: createTableNames },
};
