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
    if (!this.issues.includes(message)) this.issues.push(message);
  }

  /** Lists a line of the file that couldn't be matched, and why. */
  skip(line: SourceLine, reason: string) {
    this.unmatched.push({ line: line.number, reason, text: line.text });
  }
}
