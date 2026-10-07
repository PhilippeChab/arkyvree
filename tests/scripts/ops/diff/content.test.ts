import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { COMPARED_TABLES, LABELLED_COLUMNS, pullTable, UNCOMPARED_TABLES } from "@/scripts/ops/diff/content.ts";
import { collectDiff, diffIsEmpty, renderSql } from "@/scripts/ops/diff/rows.ts";
import { CONTENT_TABLES } from "@/scripts/ops/diff/tables.ts";
import { db } from "@/server/database/index.ts";

/** The columns that aren't content: a row's bookkeeping, and what scopes it (its ruleset, a user's own data). */
const BOOKKEEPING = ["id", "created_at", "updated_at", "deleted_at", "ruleset_id", "campaign_id", "user_id"];

/** The values a check constraint allows a text column, which a change picks another of. */
const CHECKED: Record<string, string[]> = {
  value_type: ["number", "string", "boolean"],
  chaining_operator: ["and", "or"],
};

/** Columns no other value fits, which can't change: base_rules has one value today. */
const FIXED = ["rules.rulesets.base_rules"];

/** Rows a table's test adds: one the seeds leave out of it, or a free target for a row moved under a unique key. */
const FIXTURES: Record<string, string> = {
  // A class with its 20th level alone: a level number and classes free to move it to
  "rules.klass_levels": `with klass as (
                           insert into rules.klasses (ruleset_id, name, hd)
                           select id, 'Late Bloomer', 8 from rules.rulesets where system limit 1 returning id
                         )
                         insert into rules.klass_levels (klass_id, level) select id, 20 from klass`,
  // A level without saves and a fourth save, which a level's save can move to
  "rules.klass_level_saves": `insert into rules.saves (ruleset_id, name, ability_id)
                              select ruleset_id, 'Sanity', ability_id from rules.saves limit 1;
                              insert into rules.klass_levels (klass_id, level)
                              select k.id, 20 from rules.klasses k join rules.rulesets r on r.id = k.ruleset_id
                               where r.system and not exists (
                                 select 1 from rules.klass_levels kl where kl.klass_id = k.id and kl.level = 20
                               ) limit 1`,
  "rules.mechanics": `insert into rules.mechanics (ruleset_id, name, description)
                      select id, 'Flanking', 'Two allies on opposite sides' from rules.rulesets where system limit 1`,
  "rules.klass_level_powers": `insert into rules.klass_level_powers (klass_level_id, power_id, aptitude_id, free)
                               select kl.id, pa.power_id, pa.aptitude_id, true
                                 from rules.klass_levels kl join rules.klasses k on k.id = kl.klass_id
                                 join rules.powers p on p.ruleset_id = k.ruleset_id
                                 join rules.powers_aptitudes pa on pa.power_id = p.id
                                 join rules.rulesets r on r.id = k.ruleset_id
                                where r.system limit 1`,
};

/** The system rows of each compared table (its alias `t`), with the ruleset whose comparison reads them. */
const SCOPES: Record<string, { from: string; ruleset: string }> = {
  "rules.rulesets": { from: "rules.rulesets t where t.system", ruleset: "t.id" },
  ...Object.fromEntries(
    CONTENT_TABLES.map((table) => [
      `rules.${table}`,
      {
        from: `rules.${table} t join rules.rulesets r on r.id = t.ruleset_id where r.system and t.deleted_at is null`,
        ruleset: "t.ruleset_id",
      },
    ]),
  ),
  ...Object.fromEntries(
    (["feats", "powers"] as const).map((owner) => [
      `rules.${owner}_aptitudes`,
      {
        from: `rules.${owner}_aptitudes t join rules.${owner} o on o.id = t.${owner.slice(0, -1)}_id
               join rules.rulesets r on r.id = o.ruleset_id where r.system and t.deleted_at is null`,
        ruleset: "o.ruleset_id",
      },
    ]),
  ),
  "rules.klass_levels": {
    from: "rules.klass_levels t join rules.klasses k on k.id = t.klass_id join rules.rulesets r on r.id = k.ruleset_id where r.system",
    ruleset: "k.ruleset_id",
  },
  ...Object.fromEntries(
    ["klass_level_feats", "klass_level_powers", "klass_level_saves"].map((table) => [
      `rules.${table}`,
      {
        from: `rules.${table} t join rules.klass_levels kl on kl.id = t.klass_level_id join rules.klasses k on k.id = kl.klass_id
               join rules.rulesets r on r.id = k.ruleset_id where r.system and t.deleted_at is null`,
        ruleset: "k.ruleset_id",
      },
    ]),
  ),
  "rules.klass_skills": {
    from: "rules.klass_skills t join rules.klasses k on k.id = t.klass_id join rules.rulesets r on r.id = k.ruleset_id where r.system",
    ruleset: "k.ruleset_id",
  },
  "rules.ruleset_extensions": {
    from: "rules.ruleset_extensions t join rules.rulesets r on r.id = t.ruleset_id where r.system",
    ruleset: "t.ruleset_id",
  },
  "rules.entity_snapshots": {
    from: "rules.entity_snapshots t join rules.rulesets r on r.id = t.ruleset_id where r.system",
    ruleset: "t.ruleset_id",
  },
  ...Object.fromEntries(
    [
      ["modifiers", "source"],
      ["requirements", "entity"],
      ["properties", "entity"],
    ].map(([table, owner]) => [
      `customization.${table}`,
      {
        from: `customization.${table} t join rules.feats o on o.id = t.${owner}_id and t.${owner}_type = 'feats'
               join rules.rulesets r on r.id = o.ruleset_id where r.system and t.deleted_at is null`,
        ruleset: "o.ruleset_id",
      },
    ]),
  ),
};

/** Runs `statement` in a savepoint, kept when it changed a row, else rolled back: whether it did. */
async function attempt(statement: string): Promise<boolean> {
  await db.execute(sql`savepoint attempt`);
  try {
    if ((await db.execute(sql.raw(statement))).rowCount) return true;
  } catch {
    // A constraint refused the value: the next one is tried
  }
  await db.execute(sql`rollback to savepoint attempt`);
  return false;
}

/** The values to try in turn as `column`'s new one, as SQL: other values its type and constraints allow. */
async function candidates(
  table: string,
  column: { name: string; type: string; udt: string },
  row: Record<string, unknown>,
): Promise<string[]> {
  const current = `t."${column.name}"`;
  if (column.type === "uuid") {
    const ids = await query<{ id: string }>(
      `select id::text from ${await referencedTable(table, column.name, row)} where id::text <> coalesce($1, '')
        order by created_at desc limit 500`,
      [row[column.name]],
    );
    return ids.map(({ id }) => `'${id}'::uuid`);
  }
  if (column.type === "ARRAY")
    return [`array_append(coalesce(${current}, '{}'), (select id from rules.rulesets limit 1))`];
  if (column.type === "USER-DEFINED") {
    return [
      `(select e.enumlabel::${column.udt} from pg_enum e where e.enumtypid = '${column.udt}'::regtype and e.enumlabel <> ${current}::text limit 1)`,
    ];
  }
  if (column.type === "boolean") return [`coalesce(not ${current}, true)`];
  if (column.type === "numeric") return [`coalesce(${current}, 0) + 1`];
  if (column.type === "integer")
    return [`${current} + 1`, `${current} - 1`, ...Array.from({ length: 20 }, (_, i) => String(i + 1))];

  const allowed = CHECKED[column.name] ?? (column.name === "operator" ? await operators(table) : undefined);
  return allowed
    ? allowed.filter((value) => value !== row[column.name]).map((value) => `'${value}'`)
    : [`coalesce(${current}, '') || ' (changed)'`];
}

/** The operators a customization table's check constraint allows. */
async function operators(table: string): Promise<string[]> {
  const [check] = await query<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition from pg_constraint
      where conrelid = $1::regclass and conname like '%operator_check'`,
    [table],
  );
  return [...check.definition.matchAll(/'([a-z_]+)'::text/g)].map((match) => match[1]);
}

/** The test's database, queried as diff-prod's pg client is: positional parameters ($1…), the rows. */
async function query<R extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<R[]> {
  const chunks = text
    .split(/\$(\d+)/)
    .map((part, i) => (i % 2 === 0 ? sql.raw(part) : sql.param(params[Number(part) - 1])));
  return (await db.execute(sql.join(chunks))).rows as R[];
}

/** The table `column`'s ids point to: its foreign key's, else (a customization's owner, a snapshot's entity) its type's. */
async function referencedTable(table: string, column: string, row: Record<string, unknown>): Promise<string> {
  const [fk] = await query<{ referenced: string }>(
    `select ccu.table_schema || '.' || ccu.table_name as referenced
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
      where tc.constraint_type = 'FOREIGN KEY' and kcu.table_schema || '.' || kcu.table_name = $1 and kcu.column_name = $2`,
    [table, column],
  );
  return fk?.referenced ?? `rules.${String(row.source_type ?? row.entity_type)}`;
}

describe("The content comparison (diff-prod)", () => {
  test("compares every table the seeds write, or says why not", async () => {
    const tables = await query<{ name: string }>(
      `select table_schema || '.' || table_name as name from information_schema.tables
        where table_schema in ('rules', 'customization') and table_type = 'BASE TABLE'`,
    );
    expect(tables.map(({ name }) => name).sort()).toEqual(
      [...COMPARED_TABLES, ...Object.keys(UNCOMPARED_TABLES)].sort(),
    );
  });

  // An id compared as is would differ between any two seeds; compared by name, SQL can't write it back
  test("compares every reference by the names of the rows it references", async () => {
    const references = await query<{ name: string }>(
      `select table_schema || '.' || table_name || '.' || column_name as name from information_schema.columns
        where table_schema = 'rules' and table_name = any($1) and udt_name in ('uuid', '_uuid')
          and column_name not in ('id', 'ruleset_id', 'campaign_id', 'user_id')`,
      [["rulesets", ...CONTENT_TABLES]],
    );
    const labelled = Object.entries(LABELLED_COLUMNS).flatMap(([table, columns]) =>
      columns.map((c) => `${table}.${c}`),
    );
    expect(references.map(({ name }) => name).sort()).toEqual(labelled.sort());
  });

  test("writes no UPDATE for a reference that drifted, which would set an id to a name", async () => {
    const [shield] = await query<{ id: string; ruleset_id: string }>(
      `select i.id, i.ruleset_id from rules.items i join rules.rulesets r on r.id = i.ruleset_id
        where r.system and i.source_item_id is not null limit 1`,
    );
    const before = await pullTable(query, "rules.items", shield.ruleset_id);
    await query(
      `update rules.items set source_item_id = (select id from rules.items where id <> $1 limit 1) where id = $1`,
      [shield.id],
    );
    const diff = collectDiff(before, await pullTable(query, "rules.items", shield.ruleset_id));
    const sqlLines = renderSql("rules.items", diff, LABELLED_COLUMNS["rules.items"]);
    expect(sqlLines.some((line) => line.includes("source_item_id") && line.startsWith("--"))).toBe(true);
    expect(sqlLines.filter((line) => line.startsWith("UPDATE"))).toEqual([]);
  });

  // Each column of a system row is changed in turn: the comparison of its ruleset has to see it
  test.each(COMPARED_TABLES)(
    "sees a change to any column of %s",
    async (table) => {
      if (FIXTURES[table]) await db.execute(sql.raw(FIXTURES[table]));
      const [schema, name] = table.split(".");
      const columns = (
        await query<{ name: string; type: string; udt: string }>(
          `select column_name as name, data_type as type, udt_name as udt from information_schema.columns
            where table_schema = $1 and table_name = $2 order by ordinal_position`,
          [schema, name],
        )
      ).filter((column) => !BOOKKEEPING.includes(column.name) && !FIXED.includes(`${table}.${column.name}`));
      expect(columns.length).toBeGreaterThan(0);

      const unseen: string[] = [];
      for (const column of columns) {
        const scope = SCOPES[table];
        const [target] = await query<{ ctid: string; ruleset_id: string; row: Record<string, unknown> }>(
          `select t.ctid::text as ctid, ${scope.ruleset} as ruleset_id, to_jsonb(t) as row
             from ${scope.from} order by (t."${column.name}" is null), t.created_at desc limit 1`,
        );
        if (!target) throw new Error(`${table} has no system row to change`);

        const before = await pullTable(query, table, target.ruleset_id);
        await db.execute(sql`savepoint mutation`);
        let changed = false;
        for (const value of await candidates(table, column, target.row)) {
          const update = `update ${table} t set "${column.name}" = ${value}
                           where t.ctid = '${target.ctid}'::tid and t."${column.name}" is distinct from (${value})`;
          if (await attempt(update)) {
            changed = true;
            break;
          }
        }
        const after = await pullTable(query, table, target.ruleset_id);
        await db.execute(sql`rollback to savepoint mutation`);

        if (!changed) throw new Error(`${table}.${column.name} couldn't be changed`);
        if (diffIsEmpty(collectDiff(before, after))) unseen.push(column.name);
      }
      expect(unseen).toEqual([]);
    },
    120_000,
  );
});
