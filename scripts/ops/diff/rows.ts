/**
 * Comparing rows between two databases (diff-prod.ts): matched by a business key, never by id, which every seed draws
 * anew.
 */

type FieldChange = { bk: string; targetId: string; field: string; ref: unknown; tgt: unknown };

/** A row by its business key (a name, or what a link joins), with its id in the target and its compared fields. */
export type IdentifiedRow = { bk: string; id: string; row: Record<string, unknown> };

export type TableDiff = {
  onlyInRef: string[];
  onlyInTgt: string[];
  fieldChanges: FieldChange[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The bookkeeping columns, which differ between any two seeds. */
const VOLATILE = new Set(["id", "created_at", "updated_at", "deleted_at", "ruleset_id"]);

/** A Postgres string literal, dollar-quoted with a tag the text doesn't hold. */
function dollarQuote(s: string): string {
  let tag = "q";
  while (s.includes(`$${tag}$`)) tag += "q";
  return `$${tag}$${s}$${tag}$`;
}

/** What differs between the reference's rows and the target's, by business key. */
export function collectDiff(ref: IdentifiedRow[], tgt: IdentifiedRow[]): TableDiff {
  const refMap = new Map(ref.map((r) => [r.bk, r]));
  const tgtMap = new Map(tgt.map((r) => [r.bk, r]));
  const diff: TableDiff = { onlyInRef: [], onlyInTgt: [], fieldChanges: [] };

  for (const bk of [...new Set([...refMap.keys(), ...tgtMap.keys()])].sort()) {
    const r = refMap.get(bk);
    const t = tgtMap.get(bk);
    if (!r) {
      diff.onlyInTgt.push(bk);
    } else if (!t) {
      diff.onlyInRef.push(bk);
    } else {
      for (const field of new Set([...Object.keys(r.row), ...Object.keys(t.row)])) {
        if (!Bun.deepEquals(r.row[field], t.row[field]))
          diff.fieldChanges.push({ bk, targetId: t.id, field, ref: r.row[field], tgt: t.row[field] });
      }
    }
  }
  return diff;
}

export function diffIsEmpty(d: TableDiff) {
  return d.onlyInRef.length === 0 && d.onlyInTgt.length === 0 && d.fieldChanges.length === 0;
}

/** Rows read as their business keys alone: a link compared by what it joins. */
export function keyed<T>(rows: T[], key: (row: T) => string): IdentifiedRow[] {
  return rows.map((row) => ({ bk: key(row), id: "", row: {} }));
}

/** A diff, line by line, for a person. */
export function renderHuman(d: TableDiff): string[] {
  return [
    ...d.onlyInRef.map((bk) => `only in reference: ${bk}`),
    ...d.onlyInTgt.map((bk) => `only in target: ${bk}`),
    ...d.fieldChanges.flatMap((c) => [
      `${c.bk}.${c.field}:`,
      `  reference: ${JSON.stringify(c.ref)}`,
      `  target:    ${JSON.stringify(c.tgt)}`,
    ]),
  ];
}

/**
 * The SQL that brings `table`'s (schema-qualified) drifted fields to the reference's values. What it can't write is a
 * comment, for manual handling: a row on one side only (an INSERT would need its references remapped, and a DELETE
 * could break a character's), and a `labelled` field, compared by the names of the rows it references, which no id
 * column takes.
 */
export function renderSql(table: string, d: TableDiff, labelled: readonly string[] = []): string[] {
  return [
    `-- ${table}:`,
    ...d.onlyInRef.map((bk) => `--   only in reference: ${bk} (INSERT skipped — FK remap required)`),
    ...d.onlyInTgt.map((bk) => `--   only in target: ${bk} (DELETE skipped — may be referenced by characters)`),
    ...d.fieldChanges.map((c) =>
      labelled.includes(c.field)
        ? `--   ${c.bk}.${c.field}: reference ${JSON.stringify(c.ref)}, target ${JSON.stringify(c.tgt)} (UPDATE skipped — it references other rows)`
        : `UPDATE ${table} SET ${c.field} = ${sqlLiteral(c.ref)} WHERE id = ${sqlLiteral(c.targetId)};  -- ${c.bk}`,
    ),
  ];
}

/** A value as a Postgres literal: text dollar-quoted, anything that isn't a scalar as jsonb. */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return dollarQuote(v);
  return `${dollarQuote(JSON.stringify(v))}::jsonb`;
}

/**
 * A row's comparable fields: without its bookkeeping columns, nor any UUID, a reference each seed draws anew.
 */
export function stripVolatile(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([field, value]) => !VOLATILE.has(field) && !(typeof value === "string" && UUID.test(value)),
    ),
  );
}
