import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = await mkdtemp(join(tmpdir(), "arkyvree-pdf-bundle-"));
const executable = join(directory, "pdf-probe");
const fixture = fileURLToPath(new URL("../tests/fixtures/pdf/compiled-document.tsx", import.meta.url));

try {
  const build = Bun.spawn([process.execPath, "build", fixture, "--compile", "--outfile", executable], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  const [buildCode, buildErrors] = await Promise.all([
    build.exited,
    new Response(build.stderr).text(),
    new Response(build.stdout).text(),
  ]);
  assert.equal(buildCode, 0, buildErrors);

  // Run outside the checkout so no node_modules or source assets can hide a
  // missing dependency in the same standalone binary format used on Fly.
  const run = Bun.spawn([executable], { cwd: directory, stdout: "pipe", stderr: "pipe", timeout: 30_000 });
  const [exitCode, output, errors] = await Promise.all([
    run.exited,
    new Response(run.stdout).arrayBuffer(),
    new Response(run.stderr).text(),
  ]);
  assert.equal(exitCode, 0, errors);
  const pdf = Buffer.from(output).toString("latin1");
  assert(pdf.startsWith("%PDF-"), "Expected a PDF document");
  assert(pdf.trimEnd().endsWith("%%EOF"), "Expected a complete PDF document");
  for (const font of ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"]) {
    assert(pdf.includes(`/BaseFont /${font}\n`), `Missing font ${font}`);
  }
  process.stdout.write(`Compiled PDF generation passed (${output.byteLength} bytes; all four Helvetica styles).\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
