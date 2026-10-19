import type { ImportReportDescription } from "@/engine/core/module/index.ts";

import type { SourceLine } from "./imported.ts";

/**
 * What an import says it did, as it goes: what it imported, each line of the file it couldn't match and why, and what
 * the checks a level-up runs found of a level it saved anyway. Nothing of the file is dropped silently: a line the
 * importer reads but can't match is listed here.
 */
export default class ImportReport {
  constructor(private readonly program: string) {}

  private readonly imported: string[] = [];

  private readonly issues: string[] = [];

  /** The issues said, and the lines listed with each reason: one is said once, however often it comes up. */
  private readonly said = new Set<string>();

  private readonly unmatched: ImportReportDescription["unmatched"] = [];

  /** The report as the import answers it: the lines it couldn't match in the file's order. */
  describe(): ImportReportDescription {
    const unmatched = this.unmatched.toSorted((a, b) => a.line - b.line);
    return { imported: this.imported, issues: this.issues, program: this.program, unmatched };
  }

  /** Says what was imported (`Race: Human`). */
  import(what: string) {
    this.imported.push(what);
  }

  /** Says what the checks a level-up runs found of a level saved anyway (`Level 3: 2 unspent skill point(s)`). */
  issue(message: string) {
    if (this.said.has(message)) return;
    this.said.add(message);
    this.issues.push(message);
  }

  /** Lists a line of the file that couldn't be matched, and why: once for each reason (a line's takes say one). */
  skip(line: SourceLine, reason: string) {
    const key = `${line.number}\u0000${reason}`;
    if (this.said.has(key)) return;
    this.said.add(key);
    this.unmatched.push({ line: line.number, reason, text: line.text });
  }
}
