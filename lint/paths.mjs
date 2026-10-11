/** Where a linted file sits in the repo, wherever oxlint runs from. */

import fs from "node:fs";
import path from "node:path";

const rootCache = new Map();

/** Whether a linted file sits in a repo, under the folder that holds the lint config: a copy outside it doesn't. */
export function isInRepo(file) {
  return fs.existsSync(path.join(rootOf(file), ".oxlintrc.json"));
}

/** The file's path from the repo's root, with forward slashes: `server/services/…`. */
export function repoPath(file) {
  return path.relative(rootOf(file), file).split(path.sep).join("/");
}

/** The repo's root: the nearest folder above the file that holds the lint config. */
export function rootOf(file) {
  const start = path.dirname(file);
  if (rootCache.has(start)) return rootCache.get(start);
  let dir = start;
  while (!fs.existsSync(path.join(dir, ".oxlintrc.json")) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  rootCache.set(start, dir);
  return dir;
}
