import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const oxlint = path.resolve("node_modules/.bin/oxlint");

/** A new repo of `files` (path → source) whose lint config runs our `rules` (`arkyvree/…`): its folder and config. */
function writeRepo(files: Record<string, string>, rules: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-"));
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), source);
  }
  const config = path.join(dir, ".oxlintrc.json");
  fs.writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [path.resolve("lint/plugin.mjs")],
      rules: Object.fromEntries(rules.map((rule) => [`arkyvree/${rule}`, "error"])),
    }),
  );
  return { dir, config };
}

/** One oxlint run: its output, its exit code, and whether it was killed for running past 15s. */
async function runOnce(args: string[], cwd?: string) {
  const proc = Bun.spawn([oxlint, "--threads=1", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, 15_000);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { stdout, stderr, exitCode, timedOut };
}

/** A source file of these lines, ending with a newline. */
export function lines(...rows: string[]) {
  return rows.join("\n") + "\n";
}

/**
 * Runs oxlint on one thread (the suite's other workers keep the rest of the cores), asynchronously: Bun's `spawnSync`
 * can miss a child's exit under a busy suite and block its worker for good. A run past 15s is killed and run again;
 * a second fails with oxlint's stderr.
 */
export async function runOxlint(args: string[], cwd?: string) {
  const hung = (result: Awaited<ReturnType<typeof runOnce>>) =>
    `(${args.join(" ")}; exit ${result.exitCode}): ${result.stderr}`;
  let result = await runOnce(args, cwd);
  if (result.timedOut) {
    console.warn(`oxlint hung once, running it again ${hung(result)}`);
    result = await runOnce(args, cwd);
  }
  if (result.timedOut) throw new Error(`oxlint hung twice ${hung(result)}`);
  return result;
}

/** What `oxlint --fix` with our `rules` makes of each of `files`, run `passes` times: a fix can open the way to another. */
export async function fixRepo(files: Record<string, string>, rules: string[], passes = 1) {
  const { dir, config } = writeRepo(files, rules);
  for (let pass = 0; pass < passes; pass++) await runOxlint(["-c", config, "--fix", dir]);
  const out = Object.fromEntries(
    Object.keys(files).map((file) => [file, fs.readFileSync(path.join(dir, file), "utf8")]),
  );
  fs.rmSync(dir, { recursive: true });
  return out;
}

/**
 * A repo of `files` (path → source), linted by our `rules` (`arkyvree/…`) from `from`, one of its folders: each
 * finding as `rule path`. The rules find the root by its lint config, wherever oxlint runs.
 */
export async function lintRepo(files: Record<string, string>, rules: string[], from = ".") {
  const { dir, config } = writeRepo(files, rules);
  const run = await runOxlint(["-f", "unix", "-c", config, "."], path.join(dir, from));
  fs.rmSync(dir, { recursive: true });
  return [...run.stdout.matchAll(/^\.?\/?([^:]+):\d+:\d+: .*\[Error\/arkyvree\(([a-z-]+)\)\]$/gm)]
    .map(([, file, rule]) => `${rule} ${path.posix.join(from, file)}`)
    .sort();
}
