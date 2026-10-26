import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import {
  COMPARED_TABLES,
  LABELLED_COLUMNS,
  pullTable,
  UNCOMPARED_COLUMNS,
  UNCOMPARED_TABLES,
} from "@/scripts/ops/diff/content.ts";
import { collectDiff, diffIsEmpty, renderSql } from "@/scripts/ops/diff/rows.ts";
import { db } from "@/server/database/index.ts";

/** A column's place in its table: its name, its type as information_schema gives it. */
interface Column {
  name: string;
  type: string;
  udt: string;
}

/** The columns that aren't content: a row's bookkeeping, and what scopes it (its ruleset, a user's own data). */
const BOOKKEEPING = ["id", "created_at", "updated_at", "deleted_at", "ruleset_id", "campaign_id", "user_id"];

/** The values a check constraint allows a text column, which a change picks another of. */
const CHECKED: Record<string, string[]> = {
  value_type: ["number", "string", "boolean"],
  chaining_operator: ["and", "or"],
};

/** Why an entity's type isn't a column of its own to change: it's its entity's, and its foreign key keeps it so. */
const ENTITY_TYPE = "its entity's type, which its foreign key to the entity holds";

/** Columns no other value fits, which can't change, as `<table>.<column>`, and why. */
const FIXED: Record<string, string> = {
  "rules.entities.owner_type": "its type's owner type, which the type's registry row holds",
  "rules.entity_fields.entity_type": ENTITY_TYPE,
  "rules.entity_fields.multiple": "its field's declaration's (field_defs)",
  "rules.entity_fields.value_kind": "its field's declaration's (field_defs)",
  "rules.entity_links.from_type": ENTITY_TYPE,
  "rules.entity_links.single": "its role's declaration's (link_roles)",
  "rules.entity_links.to_type": ENTITY_TYPE,
  "rules.entity_links.via_type": ENTITY_TYPE,
  "rules.ruleset_fields.multiple": "its field's declaration's (field_defs)",
  "rules.ruleset_fields.owner_type": "always rulesets",
  "rules.ruleset_fields.value_kind": "its field's declaration's (field_defs)",
  "rules.ruleset_links.to_type": ENTITY_TYPE,
  "rules.rulesets.base_rules": "one module is registered today",
};

/**
 * Rows a table's test adds: one the seeds leave out of it, a registry's row a value can move to, or a row whose every
 * column can change, made the newest so a change picks it.
 */
const FIXTURES: Record<string, string> = {
  // A mechanic, nothing points at, whose type can change; a class with its 20th level alone, a level to move
  "rules.entities": `with ruleset as (
                       select k.ruleset_id as id from rules.entities k join rules.rulesets r on r.id = k.ruleset_id
                        where r.system and k.type = 'classes'
                          and not exists (select 1 from rules.entities l where l.owner_id = k.id and l.position = 20)
                        limit 1
                     ), mechanic as (
                       insert into rules.entities (ruleset_id, type, name, description, partition, created_at)
                       select id, 'mechanics', 'Flanking', 'Two allies on opposite sides', '', now() + interval '1 minute'
                         from ruleset
                     ), klass as (
                       insert into rules.entities (ruleset_id, type, name, partition)
                       select id, 'classes', 'Late Bloomer', 'base' from ruleset returning id, ruleset_id
                     )
                     insert into rules.entities (ruleset_id, type, owner_id, owner_type, position, partition)
                     select ruleset_id, 'class_levels', id, 'classes', 20, '' from klass`,
  // A set's value, on a feat with neither set: a field it can move to
  "rules.entity_fields": `insert into rules.entity_fields (entity_id, entity_type, field, value_kind, multiple, text_value)
                          select e.id, 'feats', 'WIZARD_PROHIBITED_SCHOOL', 'text', true, 'Necromancy'
                            from rules.entities e join rules.rulesets r on r.id = e.ruleset_id
                           where r.system and e.type = 'feats' and not exists (
                             select 1 from rules.entity_fields f
                              where f.entity_id = e.id and f.field in ('WIZARD_PROHIBITED_SCHOOL', 'FEAT_FAMILY')
                           ) limit 1`,
  // A role a class level's grant can take, and a grant
  "rules.entity_links": `insert into rules.link_role_kinds (role, from_type, single) values ('alsoGrants', 'class_levels', false);
                         insert into rules.link_roles
                           (role, from_type, to_type, via_type, single, on_delete, via_on_delete)
                         values ('alsoGrants', 'class_levels', 'feats', 'aptitudes', false, 'unlink', 'unlink');
                         insert into rules.entity_links (from_id, from_type, role, single, to_id, to_type, via_id, via_type)
                         select l.id, 'class_levels', 'grants', false, f.id, 'feats', a.id, 'aptitudes'
                           from rules.entities l join rules.rulesets r on r.id = l.ruleset_id
                           join rules.entities f on f.ruleset_id = l.ruleset_id and f.type = 'feats'
                           join rules.entities a on a.ruleset_id = l.ruleset_id and a.type = 'aptitudes'
                          where r.system and l.type = 'class_levels' and not exists (
                            select 1 from rules.entity_links x where x.from_id = l.id and x.role = 'grants' and x.to_id = f.id
                          ) limit 1`,
  // A ruleset's field of every kind (none is seeded, and only sets of texts are declared), the set's value the newest
  "rules.ruleset_fields": `insert into rules.field_defs (owner_kind, owner_type, field, value_kind, multiple)
                           values ('ruleset', 'rulesets', 'TEST_NUMBER', 'number', false),
                                  ('ruleset', 'rulesets', 'TEST_FLAG', 'flag', false);
                           insert into rules.ruleset_fields (ruleset_id, field, value_kind, multiple, text_value, number_value, flag_value, created_at)
                           select r.id, f.field, f.value_kind, f.multiple, f.text_value, f.number_value, f.flag_value, f.created_at
                             from (select id from rules.rulesets where system order by name limit 1) r,
                                  (values ('RULESET_FEAT_ADVANCEMENT', 'text', true, 'Every third level', null::numeric, null::boolean, now() + interval '1 minute'),
                                          ('TEST_NUMBER', 'number', false, null, 3, null, now()),
                                          ('TEST_FLAG', 'flag', false, null, null, true, now()))
                                  as f (field, value_kind, multiple, text_value, number_value, flag_value, created_at)`,
  // A role a ruleset's link can take
  "rules.ruleset_links": `insert into rules.ruleset_roles (role, to_type, on_delete) values ('spellAbility', 'abilities', 'unlink')`,
};

/** The system rows of each compared table (its alias `t`), with the ruleset whose comparison reads them. */
const SCOPES: Record<string, { from: string; ruleset: string }> = {
  "rules.rulesets": { from: "rules.rulesets t where t.system", ruleset: "t.id" },
  "rules.entities": {
    from: "rules.entities t join rules.rulesets r on r.id = t.ruleset_id where r.system",
    ruleset: "t.ruleset_id",
  },
  // A row of an entity's (`o`), through the column that names it
  ...Object.fromEntries(
    [
      ["rules.entity_fields", "entity_id", "true"],
      ["rules.entity_links", "from_id", "true"],
      ["customization.modifiers", "source_id", "o.type = t.source_type and o.type = 'feats'"],
      ["customization.requirements", "entity_id", "o.type = t.entity_type and o.type = 'feats'"],
    ].map(([table, column, owner]) => [
      table,
      {
        from: `${table} t join rules.entities o on o.id = t.${column} and ${owner}
               join rules.rulesets r on r.id = o.ruleset_id where r.system`,
        ruleset: "o.ruleset_id",
      },
    ]),
  ),
  // A row of a ruleset's
  ...Object.fromEntries(
    ["rules.ruleset_fields", "rules.ruleset_links", "rules.ruleset_extensions", "rules.entity_snapshots"].map(
      (table) => [
        table,
        { from: `${table} t join rules.rulesets r on r.id = t.ruleset_id where r.system`, ruleset: "t.ruleset_id" },
      ],
    ),
  ),
};

/** An id, anywhere in a text. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** A value as a SQL text literal. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

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
async function candidates(table: string, column: Column, row: Record<string, unknown>): Promise<string[]> {
  const current = `t."${column.name}"`;
  const reference = await referenceOf(table, column.name);
  if (column.type === "uuid")
    return (await otherIds(column.name, row, reference?.table)).map((id) => `${literal(id)}::uuid`);
  if (column.type === "ARRAY")
    return [`array_append(coalesce(${current}, '{}'), (select id from rules.rulesets limit 1))`];
  if (column.type === "USER-DEFINED") {
    return [
      `(select e.enumlabel::${column.udt} from pg_enum e where e.enumtypid = '${column.udt}'::regtype and e.enumlabel <> ${current}::text limit 1)`,
    ];
  }
  if (column.type === "boolean") return [`coalesce(not ${current}, true)`];
  if (column.type === "numeric") return [`coalesce(${current}, 0) + 1`];
  if (column.type === "integer" || column.type === "smallint")
    return [`${current} + 1`, `${current} - 1`, ...Array.from({ length: 20 }, (_, i) => String(i + 1))];
  // A registry's value (a type, a field, a role): another the registry holds
  if (reference) {
    const values = await query<{ value: string }>(
      `select distinct "${reference.column}"::text as value from ${reference.table} where "${reference.column}"::text <> $1`,
      [row[column.name]],
    );
    return values.map(({ value }) => literal(value));
  }

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

/**
 * Other ids `column` can point to: rows of the table its foreign key references, else (a customization's owner, a
 * snapshot's entity) entities; an entity of the type the row names it by (`owner_id`'s `owner_type`, else its
 * `entity_type`).
 */
async function otherIds(
  column: string,
  row: Record<string, unknown>,
  referenced = "rules.entities",
): Promise<string[]> {
  const type = row[`${column.replace(/_id$/, "")}_type`] ?? row.entity_type;
  const byType = referenced === "rules.entities" && typeof type === "string";
  const ids = await query<{ id: string }>(
    `select id::text from ${referenced} where id::text <> coalesce($1, '') ${byType ? "and type = $2" : ""}
      order by created_at desc limit 500`,
    byType ? [row[column], type] : [row[column]],
  );
  return ids.map(({ id }) => id);
}

/** The test's database, queried as diff-prod's pg client is: positional parameters ($1…), the rows. */
async function query<R extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<R[]> {
  const chunks = text
    .split(/\$(\d+)/)
    .map((part, i) => (i % 2 === 0 ? sql.raw(part) : sql.param(params[Number(part) - 1])));
  return (await db.execute(sql.join(chunks))).rows as R[];
}

/** The table and column `column`'s foreign key references, a registry's before an entity's, if it has one. */
async function referenceOf(table: string, column: string): Promise<{ column: string; table: string } | undefined> {
  const [reference] = await query<{ column: string; table: string }>(
    `select c.confrelid::regclass::text as table, fa.attname as column
       from pg_constraint c
       cross join lateral unnest(c.conkey, c.confkey) as k (attnum, fattnum)
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.fattnum
      where c.contype = 'f' and c.conrelid = $1::regclass and a.attname = $2
      order by c.confrelid = 'rules.entities'::regclass, c.conname
      limit 1`,
    [table, column],
  );
  return reference;
}

/** The system rulesets' ids. */
async function systemRulesetIds(): Promise<string[]> {
  return (await query<{ id: string }>(`select id from rules.rulesets where system`)).map(({ id }) => id);
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
    const references = new Set(
      (
        await query<{ name: string }>(
          `select table_schema || '.' || table_name || '.' || column_name as name from information_schema.columns
            where table_schema || '.' || table_name = any($1) and udt_name in ('uuid', '_uuid')
              and column_name <> all($2)`,
          [COMPARED_TABLES, BOOKKEEPING],
        )
      ).map(({ name }) => name),
    );
    const compared = new Set<string>();
    const ids: string[] = [];
    for (const rulesetId of await systemRulesetIds()) {
      for (const table of COMPARED_TABLES) {
        for (const { bk, row } of await pullTable(query, table, rulesetId)) {
          for (const field of Object.keys(row))
            if (references.has(`${table}.${field}`)) compared.add(`${table}.${field}`);
          if (UUID.test(bk) || UUID.test(JSON.stringify(row))) ids.push(`${table}: ${bk}`);
        }
      }
    }
    const labelled = Object.entries(LABELLED_COLUMNS).flatMap(([table, columns]) =>
      columns.map((c) => `${table}.${c}`),
    );
    expect([...compared].sort()).toEqual(labelled.sort());
    expect(ids).toEqual([]);
  }, 60_000);

  test("writes no UPDATE for a reference that drifted, which would set an id to a name", async () => {
    const [extension] = await query<{ id: string }>(
      `select id from rules.rulesets where system and cardinality(ancestor_ruleset_ids) > 0 limit 1`,
    );
    const before = await pullTable(query, "rules.rulesets", extension.id);
    await query(`update rules.rulesets set ancestor_ruleset_ids = '{}' where id = $1`, [extension.id]);
    const diff = collectDiff(before, await pullTable(query, "rules.rulesets", extension.id));
    const sqlLines = renderSql("rules.rulesets", diff, LABELLED_COLUMNS["rules.rulesets"]);
    expect(sqlLines.some((line) => line.includes("ancestor_ruleset_ids") && line.startsWith("--"))).toBe(true);
    expect(sqlLines.filter((line) => line.startsWith("UPDATE"))).toEqual([]);
  });

  test("writes the UPDATE of a link's drifted column by the link's id", async () => {
    const [link] = await query<{ amount: number; id: string; ruleset_id: string }>(
      `select l.id, l.amount, e.ruleset_id from rules.entity_links l join rules.entities e on e.id = l.from_id
         join rules.rulesets r on r.id = e.ruleset_id where r.system and l.role = 'baseBonus' limit 1`,
    );
    const before = await pullTable(query, "rules.entity_links", link.ruleset_id);
    await query(`update rules.entity_links set amount = amount + 1 where id = $1`, [link.id]);
    const diff = collectDiff(before, await pullTable(query, "rules.entity_links", link.ruleset_id));
    const updates = renderSql("rules.entity_links", diff).filter((line) => line.startsWith("UPDATE"));
    expect(updates.map((line) => line.split(";")[0])).toEqual([
      `UPDATE rules.entity_links SET amount = ${link.amount} WHERE id = $q$${link.id}$q$`,
    ]);
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
            where table_schema = $1 and table_name = $2 and is_generated = 'NEVER' order by ordinal_position`,
          [schema, name],
        )
      ).filter(
        (column) =>
          !BOOKKEEPING.includes(column.name) &&
          !FIXED[`${table}.${column.name}`] &&
          !UNCOMPARED_COLUMNS[`${table}.${column.name}`],
      );
      expect(columns.length).toBeGreaterThan(0);

      const unseen: string[] = [];
      for (const column of columns) {
        const scope = SCOPES[table];
        const [target] = await query<{ ctid: string; row: Record<string, unknown>; ruleset_id: string }>(
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
