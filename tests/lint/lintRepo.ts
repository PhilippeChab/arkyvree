import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const oxlint = path.resolve("node_modules/.bin/oxlint");

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

/**
 * A repo of `files` (path → source), linted by our `rules` (`arkyvree/…`) from `from`, one of its folders: each
 * finding as `rule path`. The rules find the root by its lint config, wherever oxlint runs.
 */
export async function lintRepo(files: Record<string, string>, rules: string[], from = ".") {
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
  const run = await runOxlint(["-f", "unix", "-c", path.join(dir, ".oxlintrc.json"), "."], path.join(dir, from));
  fs.rmSync(dir, { recursive: true });
  return [...run.stdout.matchAll(/^\.?\/?([^:]+):\d+:\d+: .*\[Error\/arkyvree\(([a-z-]+)\)\]$/gm)]
    .map(([, file, rule]) => `${rule} ${path.posix.join(from, file)}`)
    .sort();
}
