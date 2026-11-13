/** What rules name, checked in every base rules the seeds hold: bound once seeded, and followed through a rename. */

import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { type RulesetEntityType, Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { stripSeparators } from "@/shared/text.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** The kinds a rename is tried on, each with the category its paths name it under. */
const KINDS: readonly RulesetEntityType[] = ["feats", "skills", "classes"];

/** The seeded system bases, one per base rules. */
async function findBases() {
  return (await Rulesets.findMany(db, { system: true })).filter((ruleset) => ruleset.rulesetId === null);
}

describe("in every base rules", () => {
  // A word the paths use themselves (a skill budget, a language pick) names no entity, and is kept as none
  test("no seeded rule that names an entity is left without what it names", async () => {
    const unbound = await db.execute<{ rows: number }>(sql`
      with named as (
        select m.id, m.target, 'modifier' as of from customization.modifiers m where m.source_type <> 'characters'
        union all
        select r.id, r.target, 'requirement' from customization.requirements r where r.target is not null
      )
      select count(*)::int as rows from named n
        where split_part(n.target, '.', 1) in ('feats', 'skills', 'classes', 'languages', 'aptitudes', 'abilities', 'saves')
          and split_part(n.target, '.', 2) not like '%*%'
          and split_part(n.target, '.', 2) not in ('budget', 'extrapicks')
          and not exists (
            select 1 from customization.name_bindings b
              where (n.of = 'modifier' and b.modifier_id = n.id) or (n.of = 'requirement' and b.requirement_id = n.id)
          )`);
    expect(unbound.rows[0].rows).toBe(0);
  });

  test("a fork renames what an inherited rule names, and the rule follows", async () => {
    const bases = await findBases();
    expect(bases.length).toBeGreaterThanOrEqual(3);
    for (const base of bases) {
      const { session } = await createTestUser();
      const fork = await RulesetsService.forkRuleset(session, base.id, { name: `Fork ${uniqueId()}`, private: false });
      const followed: string[] = [];
      for (const kind of KINDS) {
        const view = await readView(fork.id);
        const bySlug = new Map(view.rows(kind).map((row) => [stripSeparators(row.name), row]));
        const rows = [...[...view.requirementsByEntity.values()].flat(), ...view.modifiersById.values()];
        const naming = rows.filter((r) => r.target?.startsWith(`${kind}.`) && bySlug.has(r.target.split(".")[1]));
        const name = `Renamed ${kind} ${uniqueId()}`;
        // A feat the app generates keeps its name: the first rule that names one a fork may rename
        for (const rule of naming) {
          const [, slug, ...rest] = rule.target!.split(".");
          const { id } = bySlug.get(slug)!;
          const renamed = await EntitiesService.updateEntity(session, fork.id, kind, id, { name }).catch(() => null);
          if (!renamed) continue;
          const after = await readView(fork.id);
          const read = [...[...after.requirementsByEntity.values()].flat(), ...after.modifiersById.values()];
          // A rule of a feat the app made for the renamed skill went with that feat, which the rename made again
          if (!read.some((r) => r.id === rule.id)) break;
          expect({ rules: base.baseRules, target: read.find((r) => r.id === rule.id)?.target }).toEqual({
            rules: base.baseRules,
            target: [kind, stripSeparators(name), ...rest].join("."),
          });
          expect({ rules: base.baseRules, off: after.switchedOff.length }).toEqual({ rules: base.baseRules, off: 0 });
          followed.push(kind);
          break;
        }
      }
      expect({ rules: base.baseRules, followed: followed.length > 0 }).toEqual({
        rules: base.baseRules,
        followed: true,
      });
    }
  }, 60_000);

  test("a skill renamed, restored, then renamed again keeps as many feats giving to it", async () => {
    for (const base of await findBases()) {
      const { session } = await createTestUser();
      const fork = await RulesetsService.forkRuleset(session, base.id, { name: `Fork ${uniqueId()}`, private: false });
      /** The feats with a rule on a skill of this name, in the fork's view. */
      const givingTo = async (name: string) => {
        const view = await readView(fork.id);
        const prefix = `skills.${stripSeparators(name)}.`;
        return view
          .rows("feats")
          .filter((feat) => (view.modifiersBySource.get(feat.id) ?? []).some((m) => m.target.startsWith(prefix)))
          .map((feat) => feat.name)
          .toSorted();
      };
      const skills = (await readView(fork.id)).rows("skills");
      let skill = skills[0];
      for (const candidate of skills) {
        if ((await givingTo(candidate.name)).length === 0) continue;
        skill = candidate;
        break;
      }
      const before = await givingTo(skill.name);
      expect({ rules: base.baseRules, given: before.length > 0 }).toEqual({ rules: base.baseRules, given: true });
      const [first, second] = [`Renamed once ${uniqueId()}`, `Renamed twice ${uniqueId()}`];

      await EntitiesService.updateEntity(session, fork.id, "skills", skill.id, { name: first });
      await RulesetChangesService.revertOverride(session, fork.id, "skills", skill.id);
      await EntitiesService.updateEntity(session, fork.id, "skills", skill.id, { name: second });

      expect({ rules: base.baseRules, feats: (await givingTo(second)).length }).toEqual({
        rules: base.baseRules,
        feats: before.length,
      });
      expect({ rules: base.baseRules, left: await givingTo(first) }).toEqual({ rules: base.baseRules, left: [] });
    }
  }, 60_000);
});

describe("in D&D 5", () => {
  test("a condition on a background's name follows the background", async () => {
    const base = (await findBases()).find((ruleset) => ruleset.baseRules === "Dungeons & Dragons: 5")!;
    const { session } = await createTestUser();
    const fork = await RulesetsService.forkRuleset(session, base.id, { name: `Fork ${uniqueId()}`, private: false });
    const view = await readView(fork.id);
    const [background] = view.rows("backgrounds");
    const [feat] = view.rows("feats");
    const requirement = await RequirementsService.createRequirement(session, fork.id, "feats", feat.id, {
      level: "1",
      operator: "equal",
      target: "identity.background.name",
      value: background.name,
    });
    const name = `Renamed background ${uniqueId()}`;

    await EntitiesService.updateEntity(session, fork.id, "backgrounds", background.id, { name });

    const read = ((await readView(fork.id)).requirementsByEntity.get(feat.id) ?? []).find(
      (r) => r.id === requirement.id,
    );
    expect(read?.value).toBe(name);
  });

  test("the seeded rules that carry an ability's name are bound to that ability", async () => {
    const unbound = await db.execute<{ rows: number }>(sql`
      select count(*)::int as rows from customization.modifiers m
        where (m.target like 'combat.ac.unarmored.%'
            or (m.target like 'aptitudes.%.ability' and m.operator = 'set' and m.value not like '{{%'))
          and m.source_type <> 'characters'
          and not exists (
            select 1 from customization.name_bindings b
              where b.modifier_id = m.id and b.entity_type = 'abilities' and b.entity_id is not null)`);
    const named = await db.execute<{ rows: number }>(sql`
      select count(*)::int as rows from customization.modifiers m
        where m.target like 'combat.ac.unarmored.%' or m.target like 'aptitudes.%.ability'`);
    expect(named.rows[0].rows).toBeGreaterThan(0);
    expect(unbound.rows[0].rows).toBe(0);
  });
});
