import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const oxlint = path.resolve("node_modules/.bin/oxlint");

/**
 * Runs oxlint on one thread (the suite's other workers keep the rest of the cores). A run that hangs, seen now and then
 * under a full suite, is killed after 15s and run again; a second hang fails with oxlint's stderr.
 */
export function runOxlint(args: string[], cwd?: string) {
  const run = () => Bun.spawnSync([oxlint, "--threads=1", ...args], { cwd, timeout: 15_000 });
  let result = run();
  if (result.exitCode === null) {
    // oxlint-disable-next-line no-console
    console.warn(`oxlint hung once (${args.join(" ")}), running it again: ${result.stderr.toString()}`);
    result = run();
  }
  if (result.exitCode === null) throw new Error(`oxlint hung twice (${args.join(" ")}): ${result.stderr.toString()}`);
  return result;
}

/**
 * A repo of `files` (path → source), linted by our `rules` (`arkyvree/…`) from `from`, one of its folders: each
 * finding as `rule path`. The rules find the root by its lint config, wherever oxlint runs.
 */
export function lintRepo(files: Record<string, string>, rules: string[], from = ".") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-"));
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), source);
  }
  fs.writeFileSync(
    path.join(dir, ".oxlintrc.json"),
    JSON.stringify({
      jsPlugins: [path.resolve("lint/plugin.mjs")],
      rules: Object.fromEntries(rules.map((rule) => [`arkyvree/${rule}`, "error"])),
    }),
  );
  const run = runOxlint(["-f", "unix", "-c", path.join(dir, ".oxlintrc.json"), "."], path.join(dir, from));
  fs.rmSync(dir, { recursive: true });
  return [...run.stdout.toString().matchAll(/^\.?\/?([^:]+):\d+:\d+: .*\[Error\/arkyvree\(([a-z-]+)\)\]$/gm)]
    .map(([, file, rule]) => `${rule} ${path.posix.join(from, file)}`)
    .sort();
}
