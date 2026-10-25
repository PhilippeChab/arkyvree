/**
 * Parity tests: the view's links by role (a class level's grants, a class's skills) must be the links the database
 * stores, read by role, as the repository reads them. Guards against silent drift if someone adds a filter to the
 * view's composition and forgets the stored links.
 */

import { beforeAll, describe, expect, test } from "bun:test";

import { type SeedContext } from "@/database/seeders/dnd3.5/characters/seedContext.ts";
import StorageEngine from "@/engine/api/StorageEngine.ts";
import { type RulesetData, type ViewKinds, type ViewLink } from "@/engine/core/view/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { EntityLinks, Rulesets } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/fields/index.ts";

/** Every kind a ruleset's view holds, as the modules declare them. */
const KINDS = StorageEngine.shared()
  .viewSchema()
  .kinds.map(({ type }) => type as keyof ViewKinds);

/** Links' parts, by their target and pool, sorted. */
function partsOf(links: readonly ViewLink[]) {
  return links
    .map(({ amount, free, fromId, role, tier, toId, toType, viaId }) => ({
      amount,
      free,
      fromId,
      role,
      tier,
      toId,
      toType,
      viaId,
    }))
    .sort((a, b) => a.toId.localeCompare(b.toId) || String(a.viaId).localeCompare(String(b.viaId)));
}

describe("the view's links by role — parity with the stored links", () => {
  let ctx: SeedContext;
  let rulesetData: RulesetData;

  beforeAll(async () => {
    ctx = await getSeedCtx();
    const ruleset = await Rulesets.findOne(db, { id: ctx.rulesetId });
    if (!ruleset) throw new Error("seed ruleset missing");
    rulesetData = await RulesetViews.getData(ruleset);
  });

  test("a class level's granted feats are its stored grants links to feats, by their feats' names", async () => {
    const dnd35 = Dnd35View.of(rulesetData);
    const klassLevel = dnd35.klassLevelByKlassAndLevel.get(`${ctx.klassMap.pc["Fighter"]}:1`);
    expect(klassLevel).toBeDefined();

    const fromCache = dnd35.grantedFeatsOf(klassLevel!.id);
    const stored = await EntityLinks.findMany(db, { fromIds: [klassLevel!.id], role: "grants" });
    expect(fromCache.length).toBeGreaterThan(0);
    expect(partsOf(fromCache)).toEqual(partsOf(stored.filter((link) => link.toType === "feats")));
    const names = fromCache.map((link) => dnd35.featsById.get(link.toId)!.name);
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b)));
  });

  test("a class level's granted spells are its stored grants links to spells", async () => {
    const dnd35 = Dnd35View.of(rulesetData);
    for (const klassLevel of dnd35.klassLevels) {
      const stored = await EntityLinks.findMany(db, { fromIds: [klassLevel.id], role: "grants" });
      expect(partsOf(dnd35.grantedSpellsOf(klassLevel.id))).toEqual(
        partsOf(stored.filter((link) => link.toType === "spells")),
      );
    }
  });

  test("a class's skills are its stored classSkill links, by their skills' names", async () => {
    const dnd35 = Dnd35View.of(rulesetData);
    const fighterId = ctx.klassMap.pc["Fighter"];

    const fromCache = dnd35.classSkillsOf(fighterId);
    expect(fromCache.length).toBeGreaterThan(0);
    expect(partsOf(fromCache)).toEqual(
      partsOf(await EntityLinks.findMany(db, { fromIds: [fighterId], role: "classSkill" })),
    );
    const names = fromCache.map((link) => dnd35.skillsById.get(link.toId)!.name);
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b)));
    expect(rulesetData.nameLinks(fromCache).map((link) => link.toName)).toEqual(names);
  });

  test("a class level's base bonuses are its stored baseBonus links, each with its amount", async () => {
    const dnd35 = Dnd35View.of(rulesetData);
    const klassLevel = dnd35.klassLevelByKlassAndLevel.get(`${ctx.klassMap.pc["Fighter"]}:1`)!;
    const fromCache = dnd35.baseBonusesOf(klassLevel.id);
    expect(fromCache.map((link) => link.amount).toSorted()).toEqual([0, 0, 2]);
    expect(partsOf(fromCache)).toEqual(
      partsOf(await EntityLinks.findMany(db, { fromIds: [klassLevel.id], role: "baseBonus" })),
    );
  });

  test("kindValues indexes every (field, value) pair of every kind's entities' stored values", () => {
    // The kind-wide index must hold every value of each entity of each kind the view holds, and none more — verify by
    // reconstructing the expected mapping from each entity's stored values and comparing to the kind-wide one.
    let total = 0;
    for (const type of KINDS) {
      const expected = new Map<string, Set<string>>();
      for (const { id } of rulesetData.rows(type) as { id: string }[]) {
        for (const [field, values] of Object.entries(rulesetData.valuesOf(id).fields)) {
          for (const value of values) {
            const key = `${field}:${String(value)}`;
            expected.set(key, (expected.get(key) ?? new Set<string>()).add(id));
            total++;
          }
        }
      }
      const actual = new Map(
        rulesetData.kindValues(type).map(({ entityIds, field, value }) => [`${field}:${value}`, new Set(entityIds)]),
      );
      expect(actual).toEqual(expected);
    }
    // Every kind holding values among them: its classes', levels', skills' and races' too
    for (const type of ["classes", "class_levels", "feats", "items", "races", "skills", "spells"])
      expect(rulesetData.kindValues(type).length).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);

    // And: looking up a known D&D 3.5 value returns the expected spells.
    const evocation =
      rulesetData.kindValues("spells").find(({ field, value }) => field === SPELL_SCHOOL && value === "Evocation")
        ?.entityIds ?? [];
    expect(evocation.length).toBeGreaterThan(0);
    for (const id of evocation) expect(Dnd35View.of(rulesetData).spellsById.has(id)).toBe(true);
  });

  test("featsById / spellsById / skillsById resolve every composed row", () => {
    const dnd35 = Dnd35View.of(rulesetData);
    for (const feat of dnd35.feats) expect(dnd35.featsById.get(feat.id)).toBe(feat);

    for (const spell of dnd35.spells) expect(dnd35.spellsById.get(spell.id)).toBe(spell);

    for (const skill of dnd35.skills) expect(dnd35.skillsById.get(skill.id)).toBe(skill);
  });
});
