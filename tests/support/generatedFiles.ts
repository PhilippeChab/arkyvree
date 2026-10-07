/** The files of a generated folder, for the generator's tests: a file's code as a generation leaves it, its files. */

import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** A file's code as the generator leaves it, formatted: the swap formats what a generation writes. */
export function code(value: string) {
  return `export const value = "${value}";\n`;
}

/** The files under `folder`, by their path in it. */
export function filesOf(folder: string) {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)))
    .sort();
}
