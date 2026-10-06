import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { RulesetCache, type RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { type EntityType } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import {
  Aptitudes,
  Feats,
  Modifiers,
  Powers,
  PowersAptitudes,
  Properties,
  Requirements,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  editRuleset,
} from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

type Ruleset = { id: string; extensionRulesetIds: string[]; ancestorRulesetIds: string[] };

/** A winner's merged customizations, as the view shows them: their content, not their ids. */
function customizationsOf(data: RulesetData, id: string) {
  const requirementsOf = (entityId: string) =>
    (data.requirementsByEntity.get(entityId) ?? [])
      .map((r) => [r.level, r.chainingOperator, r.target, r.operator, r.value, r.valueType].join("|"))
      .sort();
  return {
    modifiers: (data.modifiersBySource.get(id) ?? [])
      .map((m) => [m.target, m.operator, m.value, m.valueType, ...requirementsOf(m.id)].join("|"))
      .sort(),
    properties: (data.propertiesByEntity.get(id) ?? []).map((p) => [p.type, p.value, p.description].join("|")).sort(),
    requirements: requirementsOf(id),
    links: [
      ...(data.featsById.get(id)?.featsAptitudesInRules.map((l) => l.aptitudeId) ?? []),
      ...(data.powersById.get(id)?.powersAptitudesInRules.map((l) => `${l.aptitudeId}|${l.level}`) ?? []),
    ].sort(),
  };
}

/** The entity type of a feat, a power or an item of the view. */
function typeOf(data: RulesetData, id: string): EntityType | undefined {
  if (data.featsById.has(id)) return "feats";
  if (data.powersById.has(id)) return "powers";
  return data.itemsById.has(id) ? "items" : undefined;
}

/**
 * Copies each winner into the ruleset, in a transaction rolled back, and compares the copy's customizations in the view
 * with the winner's before it was copied: the winners compared, and the mismatches, by winner and kind.
 */
async function compareCopies(ruleset: Ruleset, winnerIds: string[]) {
  const before = await RulesetCache.getData(ruleset);
  const mismatches: string[] = [];
  let compared = 0;
  for (const winnerId of winnerIds) {
    const type = typeOf(before, winnerId);
    if (!type) continue;
    compared++;
    const expected = customizationsOf(before, winnerId);
    await withTransaction(async (tx) => {
      const edit = await editRuleset(ruleset);
      const { id: copyId } = await edit.cowToEdit(tx, type, { id: winnerId, rulesetId: "inherited" });
      RulesetCache.invalidate(ruleset.id);
      const actual = customizationsOf(await RulesetCache.getData(ruleset), copyId);
      for (const kind of ["modifiers", "properties", "requirements", "links"] as const) {
        if (JSON.stringify(actual[kind]) === JSON.stringify(expected[kind])) continue;
        mismatches.push(`${type} ${winnerId} ${kind}: view ${expected[kind]} copy ${actual[kind]}`);
      }
      throw new Rollback();
    }).catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
    RulesetCache.invalidate(ruleset.id);
  }
  return { compared, mismatches };
}

/**
 * A fork subscribed to three extensions, each of which copies Toughness and Fireball: the first's copies win. The other
 * two each give their Toughness a modifier the winner hasn't (equal in both, a requirement of its own on each), a
 * property the winner has and one it hasn't (each with a description of its own), a condition and a group of
 * conditions, and link their Fireball to Cleric Spells, each at a level of its own.
 */
async function setupSiblings() {
  const session = makeSession();
  const host = await createSeededTestRuleset(session.userId);
  const baseId = host.ancestorRulesetIds[0];
  const feat = (await Feats.findOne(db, { rulesetId: baseId, name: "Toughness" }))!;
  const power = (await Powers.findOne(db, { rulesetId: baseId, name: "Fireball" }))!;
  const clericSpells = (await Aptitudes.findOne(db, { rulesetId: baseId, name: "Cleric Spells" }))!;
  const condition = { operator: "greater_than_or_equal", valueType: "number" };
  const extensionIds: string[] = [];
  for (const index of [0, 1, 2]) {
    const extension = await createSeededTestRuleset(session.userId);
    const featCopy = await copyEntity(db, "feats", feat.id, extension.id, [baseId], []);
    const powerCopy = await copyEntity(db, "powers", power.id, extension.id, [baseId], []);
    const owner = { entityId: featCopy.id, entityType: "feats" };
    const description = index === 0 ? "the winner's" : `sibling ${index}'s`;
    await Properties.create(db, { ...owner, type: "AUDIT", value: "shared", description });
    if (index > 0) {
      const [modifier] = await Modifiers.create(db, {
        sourceId: featCopy.id,
        sourceType: "feats",
        target: "abilities.dexterity.misc",
        operator: "add",
        value: "2",
        valueType: "number",
      });
      const wisdom = { ...condition, target: "abilities.wisdom.total", value: String(10 + index) };
      await Requirements.createMany(db, [
        { entityId: modifier.id, entityType: "modifiers", level: "1", ...wisdom },
        { ...owner, ...condition, level: "1", target: "abilities.strength.total", value: "13" },
        { ...owner, level: "2", chainingOperator: "or" },
        { ...owner, ...condition, level: "2.1", target: "abilities.dexterity.total", value: String(10 + index) },
        { ...owner, ...condition, level: "2.2", target: "abilities.constitution.total", value: String(10 + index) },
      ]);
      await Properties.create(db, { ...owner, type: "AUDIT", value: "sibling", description });
      await PowersAptitudes.create(db, { powerId: powerCopy.id, aptitudeId: clericSpells.id, level: 3 + index });
    }
    const published = { kind: "extension", status: "Published", private: false, userId: null } as const;
    await Rulesets.update(db, published, { id: extension.id });
    extensionIds.push(extension.id);
  }
  await RulesetExtensionsService.subscribeExtension(session, host.id, extensionIds);
  const fork = (await Rulesets.findOne(db, { id: host.id }))!;
  const cow = await RulesetCache.getCowData(fork);
  return { fork, featId: cow.resolve(feat.id), powerId: cow.resolve(power.id), clericSpellsId: clericSpells.id };
}

class Rollback extends Error {}

setDefaultTimeout(600_000);

describe("a sibling winner's copy", () => {
  test("holds what the view showed of every winner of a fork of every extension", async () => {
    const fork = await createSeededTestRulesetWithExtensions(makeSession().userId);
    const { cow } = await RulesetCache.getData(fork);
    const winnerIds = [...new Set([...cow.siblingIds].flatMap((loserId) => cow.getWinner(loserId) ?? []))].sort();
    const { compared, mismatches } = await compareCopies(fork, winnerIds);
    expect(compared).toBeGreaterThan(100);
    expect(mismatches).toEqual([]);
  });

  test("takes, of equal rows, the first sibling's: a modifier with its requirements, a property, a link's level", async () => {
    const { fork, featId, powerId, clericSpellsId } = await setupSiblings();
    const view = await RulesetCache.getData(fork);
    const feat = customizationsOf(view, featId);
    expect(feat.modifiers.filter((m) => m.startsWith("abilities.dexterity"))).toEqual([
      "abilities.dexterity.misc|add|2|number|1||abilities.wisdom.total|greater_than_or_equal|11|number",
    ]);
    expect(feat.properties.filter((p) => p.startsWith("AUDIT"))).toEqual([
      "AUDIT|shared|the winner's",
      "AUDIT|sibling|sibling 1's",
    ]);
    expect(feat.requirements.filter((r) => r.includes("strength"))).toHaveLength(1);
    expect(feat.requirements.filter((r) => r.includes("|or|"))).toHaveLength(2);
    expect(customizationsOf(view, powerId).links).toContain(`${clericSpellsId}|4`);
    expect(await compareCopies(fork, [featId, powerId])).toEqual({ compared: 2, mismatches: [] });
  });
});
