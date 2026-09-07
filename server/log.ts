import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { writeSync } from "node:fs";

// Replace console.* with synchronous writes to stdout/stderr so logs are never
// lost to Bun's stdout pipe buffering (the default block-buffered mode when
// stdout is a pipe can drop trailing lines on VM suspend/stop). Also emit each
// line as an OTel log record so they land in Better Stack's logs table when
// OTEL_EXPORTER_OTLP_ENDPOINT is set (no-op otherwise).

const fmt = (args: unknown[]) =>
  args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");

// requestLogger / slow-query lines embed ANSI color codes for terminal
// readability. Strip them before sending to OTel so Better Stack's logs table
// doesn't show literal escape sequences. Built via String.fromCharCode to keep
// the literal ESC byte out of the regex source (oxlint no-control-regex).
const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

const out = (fd: 1 | 2, severity: SeverityNumber, args: unknown[]) => {
  const body = fmt(args);
  try {
    writeSync(fd, body + "\n");
  } catch {
    // stdout closed or similar — ignore
  }
  try {
    logs.getLogger("arkyvree-console").emit({
      body: body.replace(ANSI, ""),
      severityNumber: severity,
    });
  } catch {
    // OTel not initialized or transient export error — ignore
  }
};

console.log = (...a: unknown[]) => out(1, SeverityNumber.INFO, a);
console.info = (...a: unknown[]) => out(1, SeverityNumber.INFO, a);
console.debug = (...a: unknown[]) => out(1, SeverityNumber.DEBUG, a);
console.warn = (...a: unknown[]) => out(2, SeverityNumber.WARN, a);
console.error = (...a: unknown[]) => out(2, SeverityNumber.ERROR, a);
