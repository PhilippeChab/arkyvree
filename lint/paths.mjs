/** Where a linted file sits in the repo, wherever oxlint runs from. */

import fs from "node:fs";
import path from "node:path";

const rootCache = new Map();

/** What a tool writes, which keeps the tool's layout: the parser's `generated/`, drizzle's schema and relations. */
const TOOL_WRITTEN = /(^|\/)generated\/|^drizzle\/(schema|relations)\.ts$/;

/** The repo's root: the nearest folder above the file that holds the lint config. */
export function rootOf(file) {
  const start = path.dirname(file);
  if (rootCache.has(start)) return rootCache.get(start);
  let dir = start;
  while (!fs.existsSync(path.join(dir, ".oxlintrc.json")) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  rootCache.set(start, dir);
  return dir;
}

/** The file's path from the repo's root, with forward slashes: `server/services/…`. */
export function repoPath(file) {
  return path.relative(rootOf(file), file).split(path.sep).join("/");
}

/** Whether a tool writes the file (`repoPath`), whose layout is the tool's. */
export function isToolWritten(file) {
  return TOOL_WRITTEN.test(repoPath(file));
}
