#!/usr/bin/env bun
/**
 * Usage:
 *   bun --env-file=.env.production run scripts/ops/diff-prod.ts
 *
 *   # With content diff against a fresh reference DB:
 *   REFERENCE_DATABASE_URL=postgresql://devuser:devpass@localhost:5433/arkyvree_test \
 *     bun --env-file=.env.production run scripts/ops/diff-prod.ts
 *
 *   # Emit SQL to reconcile target with reference (field drifts only):
 *   REFERENCE_DATABASE_URL=... \
 *     bun --env-file=.env.production run scripts/ops/diff-prod.ts --emit-sql > sync.sql
 *
 * READ-ONLY (unless you run the emitted SQL). Compares a remote database
 * (typically production) against the current codebase and optionally a
 * freshly-seeded reference DB:
 *   1. Schema drift: drizzle.__drizzle_migrations vs drizzle/meta/_journal.json
 *   2. Package drift: rules.content_packages vs database/packages/registry.ts
 *   3. Content drift (if REFERENCE_DATABASE_URL set): for every base ruleset
 *      and extension, compare row contents between reference and target.
 */
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { registry } from "@/database/packages/registry.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set — run with --env-file=.env.production");
  process.exit(1);
}

const referenceConnectionString = process.env.REFERENCE_DATABASE_URL;
const emitSql = process.argv.includes("--emit-sql");

const pool = new Pool({ connectionString });
const client = await pool.connect();

let hasDrift = false;

try {
  if (!emitSql) {
    // ── 1. Schema drift ──
    console.log("## Schema drift\n");

    const journal = JSON.parse(
      readFileSync("./drizzle/meta/_journal.json", "utf8"),
    ) as { entries: { idx: number; tag: string; when: number }[] };
    const codeMigrations = journal.entries.map((e) => ({ tag: e.tag, when: e.when }));

    const { rows: applied } = await client.query<{ created_at: string }>(
      `select created_at from drizzle.__drizzle_migrations order by created_at`,
    );

    const appliedWhens = new Set(applied.map((r) => Number(r.created_at)));
    const codeWhens = new Set(codeMigrations.map((m) => m.when));

    const missingOnRemote = codeMigrations.filter((m) => !appliedWhens.has(m.when));
    const extraOnRemote = applied
      .map((r) => Number(r.created_at))
      .filter((w) => !codeWhens.has(w));

    console.log(`Code migrations:   ${codeMigrations.length}`);
    console.log(`Remote migrations: ${applied.length}`);

    if (missingOnRemote.length === 0 && extraOnRemote.length === 0) {
      console.log(`Status: in sync`);
    } else {
      hasDrift = true;
      if (missingOnRemote.length > 0) {
        console.log(`\nIn code but not applied on remote (${missingOnRemote.length}):`);
        for (const m of missingOnRemote) console.log(`  - ${m.tag}`);
      }
      if (extraOnRemote.length > 0) {
        console.log(`\nApplied on remote but not in code (${extraOnRemote.length}):`);
        for (const w of extraOnRemote) console.log(`  - ${new Date(w).toISOString()}`);
      }
    }
    console.log();

    // ── 2. Package drift ──
    console.log("## Package drift\n");

    const { rows: remotePackages } = await client.query<{
      name: string;
      type: string;
      version: number;
      applied_at: string;
    }>(
      `select name, type, version, applied_at from rules.content_packages order by name`,
    );

    const remoteMap = new Map(remotePackages.map((p) => [p.name, p]));
    const codeMap = new Map(registry.map((p) => [p.name, p]));
    const allNames = [...new Set([...remoteMap.keys(), ...codeMap.keys()])].sort();

    const pad = Math.max(...allNames.map((n) => n.length), 4);
    console.log(`${"name".padEnd(pad)}  remote  code  status`);
    console.log(`${"-".repeat(pad)}  ------  ----  ------`);

    for (const name of allNames) {
      const r = remoteMap.get(name);
      const c = codeMap.get(name);
      const rv = r ? `v${r.version}` : "—";
      const cv = c ? `v${c.version}` : "—";
      let status: string;
      if (!r) {
        status = "missing on remote (next deploy will install)";
        hasDrift = true;
      } else if (!c) {
        status = "on remote but not in code";
        hasDrift = true;
      } else if (r.version === c.version) {
        status = "in sync";
      } else if (r.version < c.version) {
        status = `next deploy will upgrade (v${r.version} -> v${c.version})`;
        hasDrift = true;
      } else {
        status = `remote ahead of code (v${r.version} > v${c.version})`;
        hasDrift = true;
      }
      console.log(`${name.padEnd(pad)}  ${rv.padEnd(6)}  ${cv.padEnd(4)}  ${status}`);
    }
    console.log();
  }

  // ── 3. Content drift ──
  if (!referenceConnectionString) {
    if (!emitSql) {
      console.log("## Content drift\n");
      console.log("Skipped — set REFERENCE_DATABASE_URL to a freshly-seeded DB");
      console.log("(e.g. run `bun test:db:reset` then point at arkyvree_test).");
      console.log();
    } else {
      console.error("--emit-sql requires REFERENCE_DATABASE_URL");
      process.exit(1);
    }
    // In SQL-emit mode, drift is the expected output, not a failure. Only
  // exit non-zero on errors (which throw before this point).
  process.exit(emitSql ? 0 : hasDrift ? 1 : 0);
  }

  const refPool = new Pool({ connectionString: referenceConnectionString });
  const refClient = await refPool.connect();
  try {
    const contentDrift = await diffContent(client, refClient);
    if (contentDrift) hasDrift = true;
  } finally {
    refClient.release();
    await refPool.end();
  }

  // In SQL-emit mode, drift is the expected output, not a failure. Only
  // exit non-zero on errors (which throw before this point).
  process.exit(emitSql ? 0 : hasDrift ? 1 : 0);
} finally {
  client.release();
  await pool.end();
}

/**
 * Compare row contents of base rulesets and extensions between the target
 * (prod) and reference (fresh seed). Returns true if any drift was found.
 *
 * Matching strategy:
 * - rulesets: matched by (name, baseRules, system=true) since IDs are DB-
 *   generated and differ per seed run.
 * - Entity tables: pulled per-ruleset (scoped by rulesetId after resolving
 *   each side's ruleset id), matched by `name`.
 *
 * Comparison scope:
 * - Scalar fields only (text, int, bool, jsonb-as-string). UUID FKs skipped
 *   because seeds produce fresh UUIDs on each run — comparing them would
 *   report every row as drifted. Drifts in FK targets are not caught; a
 *   future pass could resolve entity FKs via a remap.
 * - Volatile/meta fields always dropped: id, createdAt, updatedAt,
 *   deletedAt, rulesetId.
 *
 * If `emitSql` is on, the function prints SQL statements to reconcile the
 * target with the reference (field-drift UPDATEs only) instead of the
 * human-readable diff. Rows only on one side are printed as SQL comments
 * with an explanation — manual handling required.
 */
async function diffContent(tgtClient: PoolClient, refClient: PoolClient): Promise<boolean> {
  if (!emitSql) console.log("## Content drift\n");

  // Content tables scoped directly by rulesetId. `rulesets` itself is
  // handled separately (matching by name + system). Some join tables
  // (klass_levels, klass_skills, etc.) still aren't compared; linkage
  // join tables that encode aptitude ownership ARE compared via
  // JOIN_TABLES below, which resolves both sides to human-readable
  // business keys so the diff is FK-remap-proof.
  const CONTENT_TABLES = [
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
  ];

  // Aptitude-link tables. Each row's business key is built from
  // human-readable names on both sides (owner + aptitude's ruleset +
  // aptitude name), so rows written against ruleset-local vs base-scoped
  // aptitude copies show up as distinct keys. Scope is the owner's
  // rulesetId (feat/power/klass).
  const JOIN_TABLES: {
    name: string;
    pull: (c: PoolClient, rulesetId: string) => Promise<IdentifiedRow[]>;
  }[] = [
    {
      name: "feats_aptitudes",
      pull: async (c, rulesetId) => {
        const { rows } = await c.query<{ feat_name: string; apt_ruleset: string; apt_name: string }>(
          `select f.name as feat_name, ar.name as apt_ruleset, a.name as apt_name
             from rules.feats_aptitudes fa
             join rules.feats f      on f.id = fa.feat_id
             join rules.aptitudes a  on a.id = fa.aptitude_id
             join rules.rulesets ar  on ar.id = a.ruleset_id
            where f.ruleset_id = $1
              and fa.deleted_at is null
              and f.deleted_at  is null
              and a.deleted_at  is null`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.feat_name} → ${r.apt_ruleset}:${r.apt_name}`,
          id: "",
          row: {},
        }));
      },
    },
    {
      name: "powers_aptitudes",
      pull: async (c, rulesetId) => {
        const { rows } = await c.query<{ power_name: string; apt_ruleset: string; apt_name: string }>(
          `select p.name as power_name, ar.name as apt_ruleset, a.name as apt_name
             from rules.powers_aptitudes pa
             join rules.powers p     on p.id = pa.power_id
             join rules.aptitudes a  on a.id = pa.aptitude_id
             join rules.rulesets ar  on ar.id = a.ruleset_id
            where p.ruleset_id = $1
              and pa.deleted_at is null
              and p.deleted_at  is null
              and a.deleted_at  is null`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.power_name} → ${r.apt_ruleset}:${r.apt_name}`,
          id: "",
          row: {},
        }));
      },
    },
    {
      name: "klass_level_feats",
      pull: async (c, rulesetId) => {
        const { rows } = await c.query<{ klass_name: string; level: number; feat_name: string; apt_ruleset: string; apt_name: string }>(
          `select k.name as klass_name, kl.level, f.name as feat_name,
                  ar.name as apt_ruleset, a.name as apt_name
             from rules.klass_level_feats klf
             join rules.klass_levels kl on kl.id = klf.klass_level_id
             join rules.klasses k       on k.id = kl.klass_id
             join rules.feats f         on f.id = klf.feat_id
             join rules.aptitudes a     on a.id = klf.aptitude_id
             join rules.rulesets ar     on ar.id = a.ruleset_id
            where k.ruleset_id = $1
              and klf.deleted_at is null
              and k.deleted_at   is null
              and f.deleted_at   is null
              and a.deleted_at   is null`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.klass_name} L${r.level} ${r.feat_name} → ${r.apt_ruleset}:${r.apt_name}`,
          id: "",
          row: {},
        }));
      },
    },
    {
      name: "klass_level_powers",
      pull: async (c, rulesetId) => {
        const { rows } = await c.query<{ klass_name: string; level: number; power_name: string; apt_ruleset: string; apt_name: string }>(
          `select k.name as klass_name, kl.level, p.name as power_name,
                  ar.name as apt_ruleset, a.name as apt_name
             from rules.klass_level_powers klp
             join rules.klass_levels kl on kl.id = klp.klass_level_id
             join rules.klasses k       on k.id = kl.klass_id
             join rules.powers p        on p.id = klp.power_id
             join rules.aptitudes a     on a.id = klp.aptitude_id
             join rules.rulesets ar     on ar.id = a.ruleset_id
            where k.ruleset_id = $1
              and klp.deleted_at is null
              and k.deleted_at   is null
              and p.deleted_at   is null
              and a.deleted_at   is null`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.klass_name} L${r.level} ${r.power_name} → ${r.apt_ruleset}:${r.apt_name}`,
          id: "",
          row: {},
        }));
      },
    },
    // Class skills: (klass_id, skill_id) — resolves skill through its ruleset
    // so cross-ruleset refs (user class → base skill) diff stably. Filters
    // to links where the target skill is in a system ruleset — user-ruleset
    // skills aren't part of seed output, so cross-pkg→user links are user
    // data and shouldn't register as pkg drift.
    {
      name: "klass_skills",
      pull: async (c, rulesetId) => {
        const { rows } = await c.query<{ klass_name: string; skill_ruleset: string; skill_name: string }>(
          `select k.name as klass_name,
                  sr.name as skill_ruleset, s.name as skill_name
             from rules.klass_skills ks
             join rules.klasses k on k.id = ks.klass_id
             join rules.skills s  on s.id = ks.skill_id
             join rules.rulesets sr on sr.id = s.ruleset_id
            where k.ruleset_id = $1
              and sr.system = true
              and k.deleted_at is null
              and s.deleted_at is null
              and ks.deleted_at is null`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.klass_name} → ${r.skill_ruleset}:${r.skill_name}`,
          id: "",
          row: {},
        }));
      },
    },
    // Class level save progression: (klass_level_id, save_id, base).
    // Key includes `base` so any BAB-style save progression drift is caught.
    {
      name: "klass_level_saves",
      pull: async (c, rulesetId) => {
        const { rows } = await c.query<{ klass_name: string; level: number; save_ruleset: string; save_name: string; base: number }>(
          `select k.name as klass_name, kl.level,
                  sr.name as save_ruleset, sv.name as save_name, kls.base
             from rules.klass_level_saves kls
             join rules.klass_levels kl on kl.id = kls.klass_level_id
             join rules.klasses k       on k.id = kl.klass_id
             join rules.saves sv        on sv.id = kls.save_id
             join rules.rulesets sr     on sr.id = sv.ruleset_id
            where k.ruleset_id = $1
              and sr.system = true
              and k.deleted_at is null
              and kl.deleted_at is null
              and sv.deleted_at is null
              and kls.deleted_at is null`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.klass_name} L${r.level} ${r.save_ruleset}:${r.save_name} base=${r.base}`,
          id: "",
          row: {},
        }));
      },
    },
    // Customizations (modifiers / requirements / properties) use polymorphic
    // source_id/entity_id with no FKs — DELETE on rules.feats/powers/etc. does
    // not cascade here, so orphans accumulate silently. Scope each row by
    // resolving the owner entity to a ruleset. BK embeds owner type + name so
    // UUIDs don't interfere.
    //
    // Requirements also support entity_type = 'modifiers' (modifier chain
    // requirements). Those are resolved through the modifier's own owner so
    // they still fall under the same ruleset section.
    {
      name: "modifiers",
      pull: async (c, rulesetId) => {
        const { rows } = await c.query<{
          source_type: string; source_name: string;
          target: string; operator: string; value: string; value_type: string;
        }>(
          `with owners as (
             select id, 'feats'::text as t, name from rules.feats      where ruleset_id = $1 and deleted_at is null
             union all select id, 'powers',    name from rules.powers     where ruleset_id = $1 and deleted_at is null
             union all select id, 'items',     name from rules.items      where ruleset_id = $1 and deleted_at is null
             union all select id, 'races',     name from rules.races      where ruleset_id = $1 and deleted_at is null
             union all select id, 'klasses',   name from rules.klasses    where ruleset_id = $1 and deleted_at is null
             union all select kl.id, 'klass_levels', (k.name || ' L' || kl.level::text)
                            from rules.klass_levels kl
                            join rules.klasses k on k.id = kl.klass_id
                           where k.ruleset_id = $1 and kl.deleted_at is null and k.deleted_at is null
             union all select id, 'skills',    name from rules.skills     where ruleset_id = $1 and deleted_at is null
             union all select id, 'abilities', name from rules.abilities  where ruleset_id = $1 and deleted_at is null
             union all select id, 'saves',     name from rules.saves      where ruleset_id = $1 and deleted_at is null
             union all select id, 'languages', name from rules.languages  where ruleset_id = $1 and deleted_at is null
             union all select id, 'mechanics', name from rules.mechanics  where ruleset_id = $1 and deleted_at is null
             union all select id, 'aptitudes', name from rules.aptitudes  where ruleset_id = $1 and deleted_at is null
             union all select $1 as id, 'rulesets', name from rules.rulesets where id = $1 and deleted_at is null
             union all select klf.id, 'klass_level_feats',
                              (k.name || ' L' || kl.level::text || ' ' || f.name)
                       from rules.klass_level_feats klf
                       join rules.klass_levels kl on kl.id = klf.klass_level_id
                       join rules.klasses k      on k.id = kl.klass_id
                       join rules.feats f        on f.id = klf.feat_id
                      where k.ruleset_id = $1
                        and klf.deleted_at is null and kl.deleted_at is null and k.deleted_at is null and f.deleted_at is null
           )
           select o.t as source_type, o.name as source_name,
                  m.target, m.operator, m.value, m.value_type
             from customization.modifiers m
             join owners o on o.id = m.source_id and o.t = m.source_type
            where m.deleted_at is null`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.source_type}:${r.source_name} | ${r.target} ${r.operator} ${r.value} (${r.value_type})`,
          id: "",
          row: {},
        }));
      },
    },
    {
      name: "requirements",
      pull: async (c, rulesetId) => {
        const { rows } = await c.query<{
          entity_type: string; entity_name: string;
          level: string; target: string | null; operator: string | null;
          value: string | null; value_type: string | null; chaining_operator: string | null;
        }>(
          `with owners as (
             select id, 'feats'::text as t, name from rules.feats      where ruleset_id = $1 and deleted_at is null
             union all select id, 'powers',    name from rules.powers     where ruleset_id = $1 and deleted_at is null
             union all select id, 'items',     name from rules.items      where ruleset_id = $1 and deleted_at is null
             union all select id, 'races',     name from rules.races      where ruleset_id = $1 and deleted_at is null
             union all select id, 'klasses',   name from rules.klasses    where ruleset_id = $1 and deleted_at is null
             union all select kl.id, 'klass_levels', (k.name || ' L' || kl.level::text)
                            from rules.klass_levels kl
                            join rules.klasses k on k.id = kl.klass_id
                           where k.ruleset_id = $1 and kl.deleted_at is null and k.deleted_at is null
             union all select id, 'skills',    name from rules.skills     where ruleset_id = $1 and deleted_at is null
             union all select id, 'abilities', name from rules.abilities  where ruleset_id = $1 and deleted_at is null
             union all select id, 'saves',     name from rules.saves      where ruleset_id = $1 and deleted_at is null
             union all select id, 'languages', name from rules.languages  where ruleset_id = $1 and deleted_at is null
             union all select id, 'mechanics', name from rules.mechanics  where ruleset_id = $1 and deleted_at is null
             union all select id, 'aptitudes', name from rules.aptitudes  where ruleset_id = $1 and deleted_at is null
             union all select $1 as id, 'rulesets', name from rules.rulesets where id = $1 and deleted_at is null
             union all select klf.id, 'klass_level_feats',
                              (k.name || ' L' || kl.level::text || ' ' || f.name)
                       from rules.klass_level_feats klf
                       join rules.klass_levels kl on kl.id = klf.klass_level_id
                       join rules.klasses k      on k.id = kl.klass_id
                       join rules.feats f        on f.id = klf.feat_id
                      where k.ruleset_id = $1
                        and klf.deleted_at is null and kl.deleted_at is null and k.deleted_at is null and f.deleted_at is null
           ),
           -- modifiers whose source entity lives in this ruleset — requirements
           -- attached to them belong to this ruleset's section.
           scoped_modifiers as (
             select m.id, ('modifier on ' || o.t || ':' || o.name || ' ' || m.target) as label
               from customization.modifiers m
               join owners o on o.id = m.source_id and o.t = m.source_type
              where m.deleted_at is null
           )
           select r.entity_type,
                  coalesce(o.name, sm.label) as entity_name,
                  r.level, r.target, r.operator, r.value, r.value_type, r.chaining_operator
             from customization.requirements r
             left join owners o on o.id = r.entity_id and o.t = r.entity_type
             left join scoped_modifiers sm on sm.id = r.entity_id and r.entity_type = 'modifiers'
            where r.deleted_at is null
              and (o.id is not null or sm.id is not null)`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.entity_type}:${r.entity_name} | L${r.level} ${r.target ?? "-"} ${r.operator ?? "-"} ${r.value ?? "-"} (${r.value_type ?? "-"}) chain=${r.chaining_operator ?? "-"}`,
          id: "",
          row: {},
        }));
      },
    },
    {
      name: "properties",
      pull: async (c, rulesetId) => {
        // Property values are sometimes UUIDs pointing at other entities (e.g.
        // KLASS_BONUS_SPELL_ABILITY_ID). Resolve those to `<type>:<name>` so
        // UUID churn between prod and a fresh seed doesn't register as drift.
        const { rows } = await c.query<{
          entity_type: string; entity_name: string;
          type: string; value: string;
        }>(
          `with owners as (
             select id, 'feats'::text as t, name from rules.feats      where ruleset_id = $1 and deleted_at is null
             union all select id, 'powers',    name from rules.powers     where ruleset_id = $1 and deleted_at is null
             union all select id, 'items',     name from rules.items      where ruleset_id = $1 and deleted_at is null
             union all select id, 'races',     name from rules.races      where ruleset_id = $1 and deleted_at is null
             union all select id, 'klasses',   name from rules.klasses    where ruleset_id = $1 and deleted_at is null
             union all select kl.id, 'klass_levels', (k.name || ' L' || kl.level::text)
                            from rules.klass_levels kl
                            join rules.klasses k on k.id = kl.klass_id
                           where k.ruleset_id = $1 and kl.deleted_at is null and k.deleted_at is null
             union all select id, 'skills',    name from rules.skills     where ruleset_id = $1 and deleted_at is null
             union all select id, 'abilities', name from rules.abilities  where ruleset_id = $1 and deleted_at is null
             union all select id, 'saves',     name from rules.saves      where ruleset_id = $1 and deleted_at is null
             union all select id, 'languages', name from rules.languages  where ruleset_id = $1 and deleted_at is null
             union all select id, 'mechanics', name from rules.mechanics  where ruleset_id = $1 and deleted_at is null
             union all select id, 'aptitudes', name from rules.aptitudes  where ruleset_id = $1 and deleted_at is null
             union all select $1 as id, 'rulesets', name from rules.rulesets where id = $1 and deleted_at is null
             union all select klf.id, 'klass_level_feats',
                              (k.name || ' L' || kl.level::text || ' ' || f.name)
                       from rules.klass_level_feats klf
                       join rules.klass_levels kl on kl.id = klf.klass_level_id
                       join rules.klasses k      on k.id = kl.klass_id
                       join rules.feats f        on f.id = klf.feat_id
                      where k.ruleset_id = $1
                        and klf.deleted_at is null and kl.deleted_at is null and k.deleted_at is null and f.deleted_at is null
           )
           select o.t as entity_type, o.name as entity_name,
                  p.type,
                  case
                    when p.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
                      coalesce(
                        (select 'abilities:' || name from rules.abilities where id::text = p.value and deleted_at is null limit 1),
                        (select 'feats:'     || name from rules.feats     where id::text = p.value and deleted_at is null limit 1),
                        (select 'powers:'    || name from rules.powers    where id::text = p.value and deleted_at is null limit 1),
                        (select 'skills:'    || name from rules.skills    where id::text = p.value and deleted_at is null limit 1),
                        (select 'saves:'     || name from rules.saves     where id::text = p.value and deleted_at is null limit 1),
                        (select 'races:'     || name from rules.races     where id::text = p.value and deleted_at is null limit 1),
                        (select 'klasses:'   || name from rules.klasses   where id::text = p.value and deleted_at is null limit 1),
                        (select 'aptitudes:' || name from rules.aptitudes where id::text = p.value and deleted_at is null limit 1),
                        (select 'items:'     || name from rules.items     where id::text = p.value and deleted_at is null limit 1),
                        (select 'mechanics:' || name from rules.mechanics where id::text = p.value and deleted_at is null limit 1),
                        (select 'languages:' || name from rules.languages where id::text = p.value and deleted_at is null limit 1),
                        '<unresolved-uuid>'
                      )
                    else p.value
                  end as value
             from customization.properties p
             join owners o on o.id = p.entity_id and o.t = p.entity_type
            where p.deleted_at is null`,
          [rulesetId],
        );
        return rows.map((r) => ({
          bk: `${r.entity_type}:${r.entity_name} | ${r.type}=${r.value}`,
          id: "",
          row: {},
        }));
      },
    },
  ];

  let drift = false;

  // Match base rulesets on both sides. Base rulesets have system=true and no userId.
  const refRulesets = await refClient.query<{ id: string; name: string; base_rules: string; private: boolean; status: string; system: boolean }>(
    `select id, name, base_rules, private, status, system from rules.rulesets where user_id is null and system = true order by name`,
  );
  const tgtRulesets = await tgtClient.query<{ id: string; name: string; base_rules: string; private: boolean; status: string; system: boolean }>(
    `select id, name, base_rules, private, status, system from rules.rulesets where user_id is null and system = true order by name`,
  );

  const refByName = new Map(refRulesets.rows.map((r) => [`${r.name}|${r.base_rules}`, r]));
  const tgtByName = new Map(tgtRulesets.rows.map((r) => [`${r.name}|${r.base_rules}`, r]));
  const allKeys = [...new Set([...refByName.keys(), ...tgtByName.keys()])].sort();

  if (allKeys.length === 0) {
    if (!emitSql) console.log("No base rulesets found. Did you `bun test:db:reset` the reference?\n");
    return false;
  }

  if (emitSql) {
    console.log(`-- Generated by scripts/ops/diff-prod.ts --emit-sql`);
    console.log(`-- Review before running. Only field-drift UPDATEs are emitted;`);
    console.log(`-- rows only on one side are listed as comments and require manual handling.`);
    console.log(`BEGIN;`);
  }

  for (const key of allKeys) {
    const ref = refByName.get(key);
    const tgt = tgtByName.get(key);
    const [name] = key.split("|");

    if (!ref) {
      if (emitSql) {
        console.log(`\n-- ${name}: only in target (reference missing this ruleset) — skipped`);
      } else {
        console.log(`### ${name}`);
        console.log(`  only in target — reference DB is missing this ruleset\n`);
      }
      drift = true;
      continue;
    }
    if (!tgt) {
      if (emitSql) {
        console.log(`\n-- ${name}: only in reference (target missing this ruleset) — skipped (INSERT would need FK remap)`);
      } else {
        console.log(`### ${name}`);
        console.log(`  only in reference — target is missing this ruleset\n`);
      }
      drift = true;
      continue;
    }

    // Collect drift per table before rendering so empty tables don't clutter output.
    const tableDiffs: { table: string; diff: TableDiff }[] = [];

    const rulesetDiff = collectDiff(
      [{ bk: name, id: ref.id, row: stripVolatile(ref) }],
      [{ bk: name, id: tgt.id, row: stripVolatile(tgt) }],
    );
    if (diffIsEmpty(rulesetDiff) === false) {
      tableDiffs.push({ table: "rulesets", diff: rulesetDiff });
    }

    for (const table of CONTENT_TABLES) {
      const refRows = await pullScoped(refClient, table, ref.id);
      const tgtRows = await pullScoped(tgtClient, table, tgt.id);
      const d = collectDiff(refRows, tgtRows);
      if (!diffIsEmpty(d)) tableDiffs.push({ table, diff: d });
    }

    for (const { name: joinTable, pull } of JOIN_TABLES) {
      const refRows = await pull(refClient, ref.id);
      const tgtRows = await pull(tgtClient, tgt.id);
      const d = collectDiff(refRows, tgtRows);
      if (!diffIsEmpty(d)) tableDiffs.push({ table: joinTable, diff: d });
    }

    if (tableDiffs.length === 0) continue;
    drift = true;

    if (emitSql) {
      console.log(`\n-- ### ${name}`);
      for (const { table, diff } of tableDiffs) {
        renderSql(table, diff);
      }
    } else {
      console.log(`### ${name}\n`);
      for (const { table, diff } of tableDiffs) {
        console.log(`  ${table}:`);
        for (const line of renderHuman(diff)) console.log(`    ${line}`);
        console.log();
      }
    }
  }

  if (emitSql) {
    console.log(`\nCOMMIT;`);
  } else if (!drift) {
    console.log("No content drift.\n");
  }

  return drift;
}

async function pullScoped(c: PoolClient, table: string, rulesetId: string): Promise<IdentifiedRow[]> {
  const { rows } = await c.query<Record<string, unknown>>(
    `select * from rules.${table} where ruleset_id = $1`,
    [rulesetId],
  );
  return rows
    .filter((r) => r.deleted_at == null)
    .map((r) => ({
      bk: String(r.name ?? r.id),
      id: String(r.id),
      row: stripVolatile(r),
    }));
}

/**
 * Drop columns that would always differ across fresh seeds. Keeps scalar
 * content (text/int/bool/jsonb). Every UUID column except the business-key
 * name we match on is dropped too — compare-by-value on UUIDs would yield
 * nonsense across independent seed runs.
 */
function stripVolatile(row: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set([
    "id",
    "created_at",
    "updated_at",
    "deleted_at",
    "ruleset_id",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k)) continue;
    // Drop any other UUID-looking FK so cross-DB comparison doesn't false-flag.
    if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

type IdentifiedRow = { bk: string; id: string; row: Record<string, unknown> };

type FieldChange = { bk: string; targetId: string; field: string; ref: unknown; tgt: unknown };

type TableDiff = {
  onlyInRef: string[];
  onlyInTgt: string[];
  fieldChanges: FieldChange[];
};

function diffIsEmpty(d: TableDiff): boolean {
  return d.onlyInRef.length === 0 && d.onlyInTgt.length === 0 && d.fieldChanges.length === 0;
}

function collectDiff(ref: IdentifiedRow[], tgt: IdentifiedRow[]): TableDiff {
  const refMap = new Map(ref.map((r) => [r.bk, r]));
  const tgtMap = new Map(tgt.map((r) => [r.bk, r]));
  const allBks = [...new Set([...refMap.keys(), ...tgtMap.keys()])].sort();

  const onlyInRef: string[] = [];
  const onlyInTgt: string[] = [];
  const fieldChanges: FieldChange[] = [];

  for (const bk of allBks) {
    const r = refMap.get(bk);
    const t = tgtMap.get(bk);
    if (!r) {
      onlyInTgt.push(bk);
      continue;
    }
    if (!t) {
      onlyInRef.push(bk);
      continue;
    }
    const fields = new Set([...Object.keys(r.row), ...Object.keys(t.row)]);
    for (const f of fields) {
      if (!deepEqual(r.row[f], t.row[f])) {
        fieldChanges.push({ bk, targetId: t.id, field: f, ref: r.row[f], tgt: t.row[f] });
      }
    }
  }

  return { onlyInRef, onlyInTgt, fieldChanges };
}

function renderHuman(d: TableDiff): string[] {
  const lines: string[] = [];
  for (const bk of d.onlyInRef) lines.push(`only in reference: ${bk}`);
  for (const bk of d.onlyInTgt) lines.push(`only in target: ${bk}`);
  for (const c of d.fieldChanges) {
    lines.push(`${c.bk}.${c.field}:`);
    lines.push(`  reference: ${JSON.stringify(c.ref)}`);
    lines.push(`  target:    ${JSON.stringify(c.tgt)}`);
  }
  return lines;
}

/**
 * Emit SQL UPDATEs to bring each drifted field in target into line with
 * reference. `onlyInRef` / `onlyInTgt` rows are printed as comments — they
 * require manual handling (INSERT would need FK remap; DELETE could break
 * downstream character references).
 */
function renderSql(table: string, d: TableDiff) {
  console.log(`-- ${table}:`);
  for (const bk of d.onlyInRef) {
    console.log(`--   only in reference: ${bk} (INSERT skipped — FK remap required)`);
  }
  for (const bk of d.onlyInTgt) {
    console.log(`--   only in target: ${bk} (DELETE skipped — may be referenced by characters)`);
  }
  for (const c of d.fieldChanges) {
    console.log(
      `UPDATE rules.${table} SET ${c.field} = ${sqlLiteral(c.ref)} WHERE id = ${sqlLiteral(c.targetId)};  -- ${c.bk}`,
    );
  }
}

/**
 * Format a JS value as a Postgres SQL literal. Uses dollar-quoting for
 * strings to avoid escaping hazards; falls back to ::jsonb for non-scalar
 * values.
 */
function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return dollarQuote(v);
  return `${dollarQuote(JSON.stringify(v))}::jsonb`;
}

/**
 * Dollar-quote a Postgres string literal. Picks a tag that doesn't appear
 * in the payload so the quoted form is safe.
 */
function dollarQuote(s: string): string {
  let tag = "q";
  while (s.includes(`$${tag}$`)) tag += "q";
  return `$${tag}$${s}$${tag}$`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}
