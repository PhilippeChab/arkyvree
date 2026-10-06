// What the seeds write, read from a database so two can be compared (diff-prod.ts): every system ruleset's rows, each
// by a business key built from names, since every seed draws new ids. tests/scripts/ops/diff/content.test.ts changes
// every column of every table below and checks the comparison sees it.

import { collectDiff, diffIsEmpty, type IdentifiedRow, stripVolatile, type TableDiff } from "./rows.ts";

type ContentTable = (typeof CONTENT_TABLES)[number];

/** Runs a query with positional parameters ($1…) and gives its rows, as pg's client does. */
export type Query = <R extends Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

/** The content tables' references to other entities, compared by what they name: `<ruleset>: <name>`. */
const REFERENCES: Partial<Record<ContentTable, Record<string, ContentTable>>> = {
  items: { source_item_id: "items" },
  klasses: { parent_id: "klasses" },
  powers: { save_id: "saves" },
  races: { parent_id: "races" },
  saves: { ability_id: "abilities" },
  skills: { primary_ability_id: "abilities" },
};

/** A ruleset's lists of other rulesets, compared by their names. */
const RULESET_LISTS = ["ancestor_ruleset_ids", "extension_ruleset_ids"];

/**
 * The entities of the ruleset `$1` that customizations belong to, each with its type (`t`) and a readable name: the
 * owners modifiers, requirements and properties are matched through, since their source_id / entity_id have no FK.
 */
const OWNERS = `
  select id, 'feats'::text as t, name from rules.feats where ruleset_id = $1 and deleted_at is null
  union all select id, 'powers', name from rules.powers where ruleset_id = $1 and deleted_at is null
  union all select id, 'items', name from rules.items where ruleset_id = $1 and deleted_at is null
  union all select id, 'races', name from rules.races where ruleset_id = $1 and deleted_at is null
  union all select id, 'klasses', name from rules.klasses where ruleset_id = $1 and deleted_at is null
  union all select kl.id, 'klass_levels', (k.name || ' L' || kl.level::text)
              from rules.klass_levels kl
              join rules.klasses k on k.id = kl.klass_id
             where k.ruleset_id = $1 and kl.deleted_at is null and k.deleted_at is null
  union all select id, 'skills', name from rules.skills where ruleset_id = $1 and deleted_at is null
  union all select id, 'abilities', name from rules.abilities where ruleset_id = $1 and deleted_at is null
  union all select id, 'saves', name from rules.saves where ruleset_id = $1 and deleted_at is null
  union all select id, 'languages', name from rules.languages where ruleset_id = $1 and deleted_at is null
  union all select id, 'mechanics', name from rules.mechanics where ruleset_id = $1 and deleted_at is null
  union all select id, 'aptitudes', name from rules.aptitudes where ruleset_id = $1 and deleted_at is null
  union all select $1 as id, 'rulesets', name from rules.rulesets where id = $1 and deleted_at is null
  union all select klf.id, 'klass_level_feats', (k.name || ' L' || kl.level::text || ' ' || f.name)
              from rules.klass_level_feats klf
              join rules.klass_levels kl on kl.id = klf.klass_level_id
              join rules.klasses k on k.id = kl.klass_id
              join rules.feats f on f.id = klf.feat_id
             where k.ruleset_id = $1
               and klf.deleted_at is null and kl.deleted_at is null and k.deleted_at is null and f.deleted_at is null`;

/** The tables scoped by their ruleset_id, compared field by field. */
export const CONTENT_TABLES = [
  "abilities",
  "aptitudes",
  "feats",
  "items",
  "klasses",
  "languages",
  "mechanics",
  "powers",
  "races",
  "saves",
  "skills",
] as const;

/** The columns compared by the names of the rows they reference, which SQL can't set back from a name. */
export const LABELLED_COLUMNS: Record<string, string[]> = {
  "rules.rulesets": RULESET_LISTS,
  ...Object.fromEntries(Object.entries(REFERENCES).map(([table, columns]) => [`rules.${table}`, Object.keys(columns)])),
};

/** The tables nothing compares, and why. */
export const UNCOMPARED_TABLES: Record<string, string> = {
  "rules.content_packages": "its versions are compared as the package drift",
  "rules.contributors": "who edits a ruleset is user data, which no seed writes",
};

/** Every entity a snapshot can name, as `<ruleset>: <name>`. */
const ENTITY_LABELS = CONTENT_TABLES.map(
  (table) =>
    `select e.id, rs.name || ': ' || e.name as label from rules.${table} e join rules.rulesets rs on rs.id = e.ruleset_id`,
).join("\n  union all ");

/** Rows read as their business keys alone: a link compared by what it joins. */
function keyed<T>(rows: T[], key: (row: T) => string): IdentifiedRow[] {
  return rows.map((row) => ({ bk: key(row), id: "", row: {} }));
}

/** A content table's rows in the ruleset, its references as `<ruleset>: <name>`. */
async function pullContent(query: Query, table: ContentTable, rulesetId: string): Promise<IdentifiedRow[]> {
  const rows = await query(`select * from rules.${table} where ruleset_id = $1 and deleted_at is null`, [rulesetId]);
  for (const [column, referenced] of Object.entries(REFERENCES[table] ?? {})) {
    const ids = [...new Set(rows.map((row) => row[column]).filter((id) => typeof id === "string"))];
    const labels = new Map(
      (
        await query<{ id: string; label: string }>(
          `select e.id, rs.name || ': ' || e.name as label
             from rules.${referenced} e join rules.rulesets rs on rs.id = e.ruleset_id
            where e.id = any($1)`,
          [ids],
        )
      ).map((r) => [r.id, r.label]),
    );
    for (const row of rows) {
      if (typeof row[column] === "string") row[column] = labels.get(row[column]) ?? "<unresolved>";
    }
  }
  return rows.map((row) => ({ bk: String(row.name ?? row.id), id: String(row.id), row: stripVolatile(row) }));
}

/**
 * The tables compared by business key alone, each built from names on both sides: a link by what it joins (an
 * aptitude by its ruleset and name, so a ruleset's own copy and the base's differ), a customization by its owner.
 */
const KEYED_TABLES: { table: string; pull: (query: Query, rulesetId: string) => Promise<IdentifiedRow[]> }[] = [
  {
    table: "rules.feats_aptitudes",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{ feat_name: string; apt_ruleset: string; apt_name: string }>(
          `select f.name as feat_name, ar.name as apt_ruleset, a.name as apt_name
             from rules.feats_aptitudes fa
             join rules.feats f on f.id = fa.feat_id
             join rules.aptitudes a on a.id = fa.aptitude_id
             join rules.rulesets ar on ar.id = a.ruleset_id
            where f.ruleset_id = $1 and fa.deleted_at is null and f.deleted_at is null and a.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `${r.feat_name} → ${r.apt_ruleset}:${r.apt_name}`,
      ),
  },
  {
    table: "rules.powers_aptitudes",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{ power_name: string; apt_ruleset: string; apt_name: string; level: number | null }>(
          `select p.name as power_name, ar.name as apt_ruleset, a.name as apt_name, pa.level
             from rules.powers_aptitudes pa
             join rules.powers p on p.id = pa.power_id
             join rules.aptitudes a on a.id = pa.aptitude_id
             join rules.rulesets ar on ar.id = a.ruleset_id
            where p.ruleset_id = $1 and pa.deleted_at is null and p.deleted_at is null and a.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `${r.power_name} → ${r.apt_ruleset}:${r.apt_name} level=${r.level ?? "-"}`,
      ),
  },
  {
    table: "rules.klass_levels",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{ klass_name: string; level: number }>(
          `select k.name as klass_name, kl.level
             from rules.klass_levels kl
             join rules.klasses k on k.id = kl.klass_id
            where k.ruleset_id = $1 and kl.deleted_at is null and k.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `${r.klass_name} L${r.level}`,
      ),
  },
  ...(["feats", "powers"] as const).map((granted) => ({
    table: `rules.klass_level_${granted}`,
    pull: async (query: Query, rulesetId: string) =>
      keyed(
        await query<{
          klass_name: string;
          level: number;
          name: string;
          apt_ruleset: string;
          apt_name: string;
          free: boolean;
        }>(
          `select k.name as klass_name, kl.level, g.name, ar.name as apt_ruleset, a.name as apt_name, kg.free
             from rules.klass_level_${granted} kg
             join rules.klass_levels kl on kl.id = kg.klass_level_id
             join rules.klasses k on k.id = kl.klass_id
             join rules.${granted} g on g.id = kg.${granted === "feats" ? "feat" : "power"}_id
             join rules.aptitudes a on a.id = kg.aptitude_id
             join rules.rulesets ar on ar.id = a.ruleset_id
            where k.ruleset_id = $1
              and kg.deleted_at is null and k.deleted_at is null and g.deleted_at is null and a.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `${r.klass_name} L${r.level} ${r.name} → ${r.apt_ruleset}:${r.apt_name}${r.free ? " (free)" : ""}`,
      ),
  })),
  // A user ruleset's skills aren't seeded: a link to one is user data, not drift
  {
    table: "rules.klass_skills",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{ klass_name: string; skill_ruleset: string; skill_name: string }>(
          `select k.name as klass_name, sr.name as skill_ruleset, s.name as skill_name
             from rules.klass_skills ks
             join rules.klasses k on k.id = ks.klass_id
             join rules.skills s on s.id = ks.skill_id
             join rules.rulesets sr on sr.id = s.ruleset_id
            where k.ruleset_id = $1 and sr.system = true
              and k.deleted_at is null and s.deleted_at is null and ks.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `${r.klass_name} → ${r.skill_ruleset}:${r.skill_name}`,
      ),
  },
  {
    table: "rules.klass_level_saves",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{ klass_name: string; level: number; save_ruleset: string; save_name: string; base: number }>(
          `select k.name as klass_name, kl.level, sr.name as save_ruleset, sv.name as save_name, kls.base
             from rules.klass_level_saves kls
             join rules.klass_levels kl on kl.id = kls.klass_level_id
             join rules.klasses k on k.id = kl.klass_id
             join rules.saves sv on sv.id = kls.save_id
             join rules.rulesets sr on sr.id = sv.ruleset_id
            where k.ruleset_id = $1 and sr.system = true
              and k.deleted_at is null and kl.deleted_at is null and sv.deleted_at is null and kls.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `${r.klass_name} L${r.level} ${r.save_ruleset}:${r.save_name} base=${r.base}`,
      ),
  },
  {
    table: "rules.ruleset_extensions",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{ extension: string }>(
          `select e.name as extension
             from rules.ruleset_extensions x join rules.rulesets e on e.id = x.extension_id
            where x.ruleset_id = $1 and x.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `extends with ${r.extension}`,
      ),
  },
  // An extension's copy of a base entity, with the hash copy-on-write compares
  {
    table: "rules.entity_snapshots",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{ entity_type: string; source: string | null; forked: string | null; content_hash: string }>(
          `with labels as (${ENTITY_LABELS})
           select s.entity_type, src.label as source, frk.label as forked, s.content_hash
             from rules.entity_snapshots s
             left join labels src on src.id = s.source_entity_id
             left join labels frk on frk.id = s.forked_entity_id
            where s.ruleset_id = $1`,
          [rulesetId],
        ),
        (r) => `${r.entity_type}: ${r.source ?? "<unresolved>"} → ${r.forked ?? "<unresolved>"} #${r.content_hash}`,
      ),
  },
  {
    table: "customization.modifiers",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{
          source_type: string;
          source_name: string;
          target: string;
          operator: string;
          value: string;
          value_type: string;
        }>(
          `with owners as (${OWNERS})
           select o.t as source_type, o.name as source_name, m.target, m.operator, m.value, m.value_type
             from customization.modifiers m
             join owners o on o.id = m.source_id and o.t = m.source_type
            where m.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `${r.source_type}:${r.source_name} | ${r.target} ${r.operator} ${r.value} (${r.value_type})`,
      ),
  },
  // A modifier's own requirements belong to its owner's ruleset
  {
    table: "customization.requirements",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{
          entity_type: string;
          entity_name: string;
          level: string;
          target: string | null;
          operator: string | null;
          value: string | null;
          value_type: string | null;
          chaining_operator: string | null;
        }>(
          `with owners as (${OWNERS}),
           scoped_modifiers as (
             select m.id, ('modifier on ' || o.t || ':' || o.name || ' ' || m.target) as label
               from customization.modifiers m
               join owners o on o.id = m.source_id and o.t = m.source_type
              where m.deleted_at is null
           )
           select r.entity_type, coalesce(o.name, sm.label) as entity_name,
                  r.level, r.target, r.operator, r.value, r.value_type, r.chaining_operator
             from customization.requirements r
             left join owners o on o.id = r.entity_id and o.t = r.entity_type
             left join scoped_modifiers sm on sm.id = r.entity_id and r.entity_type = 'modifiers'
            where r.deleted_at is null and (o.id is not null or sm.id is not null)`,
          [rulesetId],
        ),
        (r) =>
          `${r.entity_type}:${r.entity_name} | L${r.level} ${r.target ?? "-"} ${r.operator ?? "-"} ${r.value ?? "-"} (${r.value_type ?? "-"}) chain=${r.chaining_operator ?? "-"}`,
      ),
  },
  // A property's value can be another entity's id (KLASS_BONUS_SPELL_ABILITY_ID): compared by what it names
  {
    table: "customization.properties",
    pull: async (query, rulesetId) =>
      keyed(
        await query<{
          entity_type: string;
          entity_name: string;
          type: string;
          value: string;
          description: string | null;
        }>(
          `with owners as (${OWNERS}), labels as (${ENTITY_LABELS})
           select o.t as entity_type, o.name as entity_name, p.type, p.description,
                  case
                    when p.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then coalesce((select l.label from labels l where l.id::text = p.value limit 1), '<unresolved-uuid>')
                    else p.value
                  end as value
             from customization.properties p
             join owners o on o.id = p.entity_id and o.t = p.entity_type
            where p.deleted_at is null`,
          [rulesetId],
        ),
        (r) => `${r.entity_type}:${r.entity_name} | ${r.type}=${r.value}${r.description ? ` (${r.description})` : ""}`,
      ),
  },
];

/** The ruleset's own row, the rulesets it lists (its ancestors, its extensions) by name. */
async function pullRulesetRow(query: Query, rulesetId: string): Promise<IdentifiedRow[]> {
  const rows = await query(`select * from rules.rulesets where id = $1`, [rulesetId]);
  const names = new Map(
    (await query<{ id: string; name: string }>(`select id, name from rules.rulesets`)).map((r) => [r.id, r.name]),
  );
  return rows.map((row) => {
    for (const column of RULESET_LISTS) {
      const ids = row[column];
      if (Array.isArray(ids)) row[column] = ids.map((id) => names.get(id) ?? "<unresolved>");
    }
    return { bk: String(row.name), id: String(row.id), row: stripVolatile(row) };
  });
}

/** Every table compared, schema-qualified. */
export const COMPARED_TABLES = [
  "rules.rulesets",
  ...CONTENT_TABLES.map((table) => `rules.${table}`),
  ...KEYED_TABLES.map(({ table }) => table),
];

/** The system rulesets (the base rulesets and the published extensions), which seeds write, by name and base rules. */
async function systemRulesets(query: Query) {
  const rows = await query<{ id: string; name: string; base_rules: string }>(
    `select id, name, base_rules from rules.rulesets where user_id is null and system = true and deleted_at is null`,
  );
  return new Map(rows.map((r) => [`${r.name}|${r.base_rules}`, r]));
}

/** A compared table's rows of the ruleset. */
export async function pullTable(query: Query, table: string, rulesetId: string): Promise<IdentifiedRow[]> {
  if (table === "rules.rulesets") return pullRulesetRow(query, rulesetId);
  const content = CONTENT_TABLES.find((t) => `rules.${t}` === table);
  if (content) return pullContent(query, content, rulesetId);
  const keyedTable = KEYED_TABLES.find((t) => t.table === table);
  if (!keyedTable) throw new Error(`${table} isn't compared`);
  return keyedTable.pull(query, rulesetId);
}

/** How the target's system rulesets differ from the reference's: those on one side only, and the others' drifts. */
export async function diffContent(target: Query, reference: Query) {
  const refByName = await systemRulesets(reference);
  const tgtByName = await systemRulesets(target);
  const result: {
    onlyInTarget: string[];
    onlyInReference: string[];
    drifted: { ruleset: string; tables: { table: string; diff: TableDiff }[] }[];
  } = { onlyInTarget: [], onlyInReference: [], drifted: [] };

  for (const key of [...new Set([...refByName.keys(), ...tgtByName.keys()])].sort()) {
    const [name] = key.split("|");
    const ref = refByName.get(key);
    const tgt = tgtByName.get(key);
    if (!ref) result.onlyInTarget.push(name);
    else if (!tgt) result.onlyInReference.push(name);
    else {
      const tables: { table: string; diff: TableDiff }[] = [];
      for (const table of COMPARED_TABLES) {
        const diff = collectDiff(await pullTable(reference, table, ref.id), await pullTable(target, table, tgt.id));
        if (!diffIsEmpty(diff)) tables.push({ table, diff });
      }
      if (tables.length > 0) result.drifted.push({ ruleset: name, tables });
    }
  }
  return result;
}
