/** What a file imports: each import's target in the repo, and whether it brings types only. */

import path from "node:path";

/** Whether an import brings in types only: `import type`, or every specifier `type`. */
function typeOnly(node) {
  if (node.importKind === "type" || node.exportKind === "type") return true;
  const specifiers = node.specifiers ?? [];
  return specifiers.length > 0 && specifiers.every((s) => s.importKind === "type" || s.exportKind === "type");
}

/** Every import and re-export a file makes: its node, its specifier, and whether it brings types only. */
export function onImports(callback) {
  const visit = (node) => {
    if (node.source && typeof node.source.value === "string") callback(node, node.source.value, typeOnly(node));
  };
  return {
    ImportDeclaration: visit,
    ExportNamedDeclaration: visit,
    ExportAllDeclaration: visit,
    ImportExpression(node) {
      if (node.source?.type === "Literal" && typeof node.source.value === "string")
        callback(node, node.source.value, false);
    },
  };
}

/** An import's target, as a repo path: `@/x`, or relative to the importer. Packages have none. */
export function targetOf(importer, spec) {
  if (spec.startsWith("@/")) return path.posix.normalize(spec.slice(2));
  if (spec.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(importer), spec));
  return null;
}
