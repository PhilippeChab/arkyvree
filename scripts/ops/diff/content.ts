/**
 * What the seeds write, read from a database so two can be compared (diff-prod.ts): every system ruleset's rows, each
 * by a business key built from names, since every seed draws new ids. tests/scripts/ops/diff/dnd3.5/content.test.ts
 * changes every column of every table below and checks the comparison sees it.
 */

import { collectDiff, diffIsEmpty, type IdentifiedRow, keyed, stripVolatile, type TableDiff } from "./rows.ts";

/** Runs a query with positional parameters ($1…) and gives its rows, as pg's client does. */
export type Query = <R extends Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

/**
 * Every entity's business key, by its id (`entity_keys`): its type, its ruleset's name, its name and its partition (a
 * class's or a race's kind), or an owned entity's (a class level's) type, its owner's key and its position (one owner:
 * no entity type is owned by an owned one). It reads every ruleset's entities, since a link names
 * another ruleset's (an extension's feat, the base's aptitude). A query goes on with its own common table expressions
 * (`, x as (…)`), or its select.
 */
const ENTITY_KEYS = `
  with entity_keys (id, key) as (
    select e.id,
           case
             when o.id is null then e.type || ' ' || rs.name || ': ' || e.name
             else e.type || ' of ' || o.type || ' ' || rs.name || ': ' || o.name
                  || case when o.partition = '' then '' else ' (' || o.partition || ')' end
                  || coalesce(' #' || e.position::text, ' ' || e.name)
           end || case when e.partition = '' then '' else ' (' || e.partition || ')' end
      from rules.entities e
      join rules.rulesets rs on rs.id = e.ruleset_id
      left join rules.entities o on o.id = e.owner_id
  )`;

/**
 * The entities of the ruleset `$1` that customizations belong to (its own row among them), each with its type (`t`)
 * and its key: the owners modifiers and requirements are matched through, since their source_id / entity_id have no
 * FK. Follows ENTITY_KEYS.
 */
const OWNERS = `,
  owners as (
    select e.id, e.type as t, k.key as name
      from rules.entities e
      join entity_keys k on k.id = e.id
     where e.ruleset_id = $1
    union all select id, 'rulesets', 'rulesets ' || name from rules.rulesets where id = $1
  )`;

/** Why a registry isn't compared. */
const REGISTRY = "a registry: what the modules declare, which every migration syncs from the code";

/** Why a field's ordinal isn't compared. */
const SET_ORDINAL = "a set's values are compared as a set: an ordinal keys a value, it orders none";

/** A field's value (`f`), whatever its kind, as text. */
const VALUE = "coalesce(f.text_value, trim_scale(f.number_value)::text, f.flag_value::text)";

/** A field's values (`f`) as one text: a single value as it is, a set's sorted, between braces, whatever their ordinals. */
const VALUES = `case
    when bool_or(f.multiple) then '{' || string_agg(${VALUE}, ', ' order by ${VALUE} collate "C") || '}'
    else min(${VALUE})
  end`;

/** Every table compared, schema-qualified. */
export const COMPARED_TABLES = [
  "rules.rulesets",
  "rules.entities",
  "rules.entity_fields",
  "rules.entity_links",
  "rules.ruleset_fields",
  "rules.ruleset_links",
  "rules.ruleset_extensions",
  "rules.entity_snapshots",
  "customization.modifiers",
  "customization.requirements",
];

/** The columns of a compared table nothing compares, as `<table>.<column>`, and why. */
export const UNCOMPARED_COLUMNS: Record<string, string> = {
  "rules.entity_fields.ordinal": SET_ORDINAL,
  "rules.ruleset_fields.ordinal": SET_ORDINAL,
};

/** The tables nothing compares, and why. */
export const UNCOMPARED_TABLES: Record<string, string> = {
  "rules.content_packages": "its versions are compared as the package drift",
  "rules.contributors": "who edits a ruleset is user data, which no seed writes",
  "rules.entity_types": REGISTRY,
  "rules.field_defs": REGISTRY,
  "rules.link_role_kinds": REGISTRY,
  "rules.link_roles": REGISTRY,
  "rules.modules": REGISTRY,
  "rules.ruleset_roles": REGISTRY,
};

/** The ruleset's entities, by their keys: their own columns, the ones their keys leave out among them. */
async function pullEntities(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  const rows = await query<{ id: string; key: string }>(
    `${ENTITY_KEYS}
     select e.id, k.key, e.type, e.name, e.description, e.partition, e.position, e.owner_type
       from rules.entities e
       join entity_keys k on k.id = e.id
      where e.ruleset_id = $1`,
    [rulesetId],
  );
  return rows.map(({ id, key, ...row }) => ({ bk: key, id, row }));
}

/** The fields of the ruleset's entities, each by its entity's key, its field and its value (a set's, all of them). */
async function pullEntityFields(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  return keyed(
    await query<{ field: string; key: string; value: string }>(
      `${ENTITY_KEYS}
       select k.key, f.field, ${VALUES} as value
         from rules.entity_fields f
         join rules.entities e on e.id = f.entity_id
         join entity_keys k on k.id = e.id
        where e.ruleset_id = $1
        group by k.key, f.field`,
      [rulesetId],
    ),
    (r) => `${r.key} | ${r.field} = ${r.value}`,
  );
}

/**
 * The links from the ruleset's entities, each by its role and the keys of the entities it joins, its own columns
 * compared. A link to a user ruleset's entity isn't seeded: it's user data, not drift.
 */
async function pullEntityLinks(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  const rows = await query<{
    amount: number | null;
    free: boolean;
    from_key: string;
    id: string;
    ordinal: number;
    role: string;
    tier: number | null;
    to_key: string;
    via_key: string | null;
  }>(
    `${ENTITY_KEYS}
     select l.id, fk.key as from_key, l.role, tk.key as to_key, vk.key as via_key, l.tier, l.amount, l.free, l.ordinal
       from rules.entity_links l
       join rules.entities f on f.id = l.from_id
       join entity_keys fk on fk.id = l.from_id
       join rules.entities t on t.id = l.to_id
       join rules.rulesets tr on tr.id = t.ruleset_id
       join entity_keys tk on tk.id = l.to_id
       left join entity_keys vk on vk.id = l.via_id
      where f.ruleset_id = $1 and tr.system`,
    [rulesetId],
  );
  return rows.map(({ amount, free, from_key, id, ordinal, role, tier, to_key, via_key }) => ({
    bk: `${from_key} | ${role} → ${to_key}${via_key ? ` via ${via_key}` : ""}`,
    id,
    row: { tier, amount, free, ordinal },
  }));
}

/** The customizations of the ruleset's entities, each by its owner's key and what it says. */
async function pullModifiers(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  return keyed(
    await query<{ operator: string; source_name: string; target: string; value: string; value_type: string }>(
      `${ENTITY_KEYS}${OWNERS}
       select o.name as source_name, m.target, m.operator, m.value, m.value_type
         from customization.modifiers m
         join owners o on o.id = m.source_id and o.t = m.source_type`,
      [rulesetId],
    ),
    (r) => `${r.source_name} | ${r.target} ${r.operator} ${r.value} (${r.value_type})`,
  );
}

/** The requirements of the ruleset's entities, and of their modifiers, which belong to their owner's ruleset. */
async function pullRequirements(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  return keyed(
    await query<{
      chaining_operator: string | null;
      entity_name: string;
      level: string;
      operator: string | null;
      target: string | null;
      value: string | null;
      value_type: string | null;
    }>(
      `${ENTITY_KEYS}${OWNERS},
       scoped_modifiers as (
         select m.id, ('modifier on ' || o.name || ' ' || m.target) as label
           from customization.modifiers m
           join owners o on o.id = m.source_id and o.t = m.source_type
       )
       select coalesce(o.name, sm.label) as entity_name,
              r.level, r.target, r.operator, r.value, r.value_type, r.chaining_operator
         from customization.requirements r
         left join owners o on o.id = r.entity_id and o.t = r.entity_type
         left join scoped_modifiers sm on sm.id = r.entity_id and r.entity_type = 'modifiers'
        where o.id is not null or sm.id is not null`,
      [rulesetId],
    ),
    (r) =>
      `${r.entity_name} | L${r.level} ${r.target ?? "-"} ${r.operator ?? "-"} ${r.value ?? "-"} (${r.value_type ?? "-"}) chain=${r.chaining_operator ?? "-"}`,
  );
}

/** The rulesets the ruleset extends with, by name, each at its place in their order. */
async function pullRulesetExtensions(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  return keyed(
    await query<{ extension: string; ordinal: number }>(
      `select e.name as extension, x.ordinal
         from rules.ruleset_extensions x join rules.rulesets e on e.id = x.extension_id
        where x.ruleset_id = $1 and x.deleted_at is null`,
      [rulesetId],
    ),
    (r) => `extends with ${r.extension} at ${r.ordinal}`,
  );
}

/** The ruleset's fields, each by its field and its value (a set's, all of them). */
async function pullRulesetFields(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  return keyed(
    await query<{ field: string; value: string }>(
      `select f.field, ${VALUES} as value from rules.ruleset_fields f where f.ruleset_id = $1 group by f.field`,
      [rulesetId],
    ),
    (r) => `${r.field} = ${r.value}`,
  );
}

/** The ruleset's links to entities (its skill points' ability), each by its role and the entity's key. */
async function pullRulesetLinks(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  return keyed(
    await query<{ key: string; role: string }>(
      `${ENTITY_KEYS}
       select l.role, k.key from rules.ruleset_links l join entity_keys k on k.id = l.to_id where l.ruleset_id = $1`,
      [rulesetId],
    ),
    (r) => `${r.role} → ${r.key}`,
  );
}

/** The ruleset's own row. */
async function pullRulesetRow(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  const rows = await query(`select * from rules.rulesets where id = $1`, [rulesetId]);
  return rows.map((row) => ({ bk: String(row.name), id: String(row.id), row: stripVolatile(row) }));
}

/** An extension's copies of a base entity, each by the keys of both. */
async function pullSnapshots(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  return keyed(
    await query<{ forked: string | null; source: string | null }>(
      `${ENTITY_KEYS}
       select src.key as source, frk.key as forked
         from rules.entity_snapshots s
         left join entity_keys src on src.id = s.source_entity_id
         left join entity_keys frk on frk.id = s.forked_entity_id
        where s.ruleset_id = $1`,
      [rulesetId],
    ),
    (r) => `${r.source ?? "<unresolved>"} → ${r.forked ?? "<unresolved>"}`,
  );
}

/** The system rulesets (the base rulesets and the published extensions), which seeds write, by name and base rules. */
async function systemRulesets(query: Query) {
  const rows = await query<{ base_rules: string; id: string; name: string }>(
    `select id, name, base_rules from rules.rulesets where user_id is null and system = true`,
  );
  return new Map(rows.map((r) => [`${r.name}|${r.base_rules}`, r]));
}

/** How the target's system rulesets differ from the reference's: those on one side only, and the others' drifts. */
export async function diffContent(target: Query, reference: Query) {
  const refByName = await systemRulesets(reference);
  const tgtByName = await systemRulesets(target);
  const result: {
    drifted: { ruleset: string; tables: { diff: TableDiff; table: string }[] }[];
    onlyInReference: string[];
    onlyInTarget: string[];
  } = { onlyInTarget: [], onlyInReference: [], drifted: [] };

  for (const key of [...new Set([...refByName.keys(), ...tgtByName.keys()])].sort()) {
    const [name] = key.split("|");
    const ref = refByName.get(key);
    const tgt = tgtByName.get(key);
    if (!ref) {
      result.onlyInTarget.push(name);
    } else if (!tgt) {
      result.onlyInReference.push(name);
    } else {
      const tables: { diff: TableDiff; table: string }[] = [];
      for (const table of COMPARED_TABLES) {
        const diff = collectDiff(await pullTable(reference, table, ref.id), await pullTable(target, table, tgt.id));
        if (!diffIsEmpty(diff)) tables.push({ table, diff });
      }
      if (tables.length > 0) result.drifted.push({ ruleset: name, tables });
    }
  }
  return result;
}

/** A compared table's rows of the ruleset. */
export async function pullTable(query: Query, table: string, rulesetId: string): Promise<IdentifiedRow[]> {
  switch (table) {
    case "customization.modifiers":
      return pullModifiers(query, rulesetId);
    case "customization.requirements":
      return pullRequirements(query, rulesetId);
    case "rules.entities":
      return pullEntities(query, rulesetId);
    case "rules.entity_fields":
      return pullEntityFields(query, rulesetId);
    case "rules.entity_links":
      return pullEntityLinks(query, rulesetId);
    case "rules.entity_snapshots":
      return pullSnapshots(query, rulesetId);
    case "rules.ruleset_extensions":
      return pullRulesetExtensions(query, rulesetId);
    case "rules.ruleset_fields":
      return pullRulesetFields(query, rulesetId);
    case "rules.ruleset_links":
      return pullRulesetLinks(query, rulesetId);
    case "rules.rulesets":
      return pullRulesetRow(query, rulesetId);
    default:
      throw new Error(`${table} isn't compared`);
  }
}
