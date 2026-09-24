import { beforeEach, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { invalidateAll } from "@/server/cache/index.ts";
import { Aptitudes, Feats, Properties, Sessions } from "@/server/repositories/index.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { seedFeats } from "@/database/packages/dnd35/seed-utils.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

beforeEach(() => invalidateAll());

async function setup() {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const extension = await createSeededTestRuleset(session.userId, { private: false });
  const general = (await Aptitudes.findOne(db, { rulesetId: extension.ancestorRulesetIds[0], name: "General" }))!;
  const wizard = (await Aptitudes.findOne(db, { rulesetId: extension.ancestorRulesetIds[0], name: "Wizard Spells" }))!;
  return { session, extension, general, wizard };
}

async function subscribe(session: Awaited<ReturnType<typeof setup>>["session"], extensionId: string) {
  await RulesetsMethods.publishRuleset(session, extensionId, { kind: "extension" });
  const host = await createSeededTestRuleset(session.userId);
  await RulesetsMethods.subscribeExtension(session, host.id, [extensionId]);
  return host;
}

for (const operation of ["delete", "property", "school"] as const) test(`inherited spell-school families clean up after ${operation} and require explicit feat restoration`, async () => {
  const { session, extension, wizard } = await setup();
  const spell = await PowersMethods.createRulesetPower(session, extension.id, { name: "Unique School Spell", school: "Lifecycle School", aptitudes: [{ id: wizard.id }] });
  const original = (await Feats.findOne(db, { rulesetId: extension.id, name: "Spell Focus: Lifecycle School" }))!;
  const greater = (await Feats.findOne(db, { rulesetId: extension.id, name: "Greater Spell Focus: Lifecycle School" }))!;
  const host = await subscribe(session, extension.id);
  await FeatsMethods.updateRulesetFeat(session, host.id, original.id, { name: "Renamed School Focus" });
  if (operation === "delete") await PowersMethods.deleteRulesetPower(session, host.id, spell.id);
  else if (operation === "school") await PowersMethods.updateRulesetPower(session, host.id, spell.id, { name: spell.name, school: "Replacement School" });
  else {
    const property = (await Properties.findManyByEntity(db, { entityIds: [spell.id], entityType: "powers", type: "SPELL_SCHOOL" }))[0];
    await PropertiesMethods.updateEntityProperty(session, host.id, "powers", spell.id, property.id, { type: "SPELL_SCHOOL", value: "Replacement School" });
  }
  await withRulesetScope(db, host.id, async ({ rulesetData }) => {
    expect(rulesetData.featsById.has(original.id)).toBe(false);
    expect(rulesetData.featsById.has(greater.id)).toBe(false);
  });
  expect(await Feats.findOne(db, { id: original.id })).toEqual(original);
  await RulesetsMethods.revertOverride(session, host.id, "powers", spell.id);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => {
    expect(rulesetData.featsById.has(original.id)).toBe(false);
    expect(rulesetData.featsById.has(greater.id)).toBe(false);
    expect(rulesetData.feats.some(feat => feat.name.includes("Replacement School"))).toBe(false);
  });
  await RulesetsMethods.revertOverride(session, host.id, "feats", original.id);
  await RulesetsMethods.revertOverride(session, host.id, "feats", greater.id);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => {
    expect(rulesetData.featsById.get(original.id)?.id).toBe(original.id);
    expect(rulesetData.featsById.get(greater.id)?.id).toBe(greater.id);
  });
});

test("another visible spell keeps the school's generated feats", async () => {
  const { session, extension, wizard } = await setup();
  const first = await PowersMethods.createRulesetPower(session, extension.id, { name: "First Spell", school: "Shared School", aptitudes: [{ id: wizard.id }] });
  const second = await PowersMethods.createRulesetPower(session, extension.id, { name: "Second Spell", school: "Shared School", aptitudes: [{ id: wizard.id }] });
  const focus = (await Feats.findOne(db, { rulesetId: extension.id, name: "Spell Focus: Shared School" }))!;
  const host = await subscribe(session, extension.id);
  await PowersMethods.deleteRulesetPower(session, host.id, first.id);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(focus.id)).toBe(true));
  await PowersMethods.deleteRulesetPower(session, host.id, second.id);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(focus.id)).toBe(false));
  await RulesetsMethods.revertOverride(session, host.id, "powers", second.id);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(focus.id)).toBe(false));
  await RulesetsMethods.revertOverride(session, host.id, "feats", focus.id);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(focus.id)).toBe(true));
});

test("a source-chain feat tombstone stays hidden when another spell is created", async () => {
  const { session, extension, wizard } = await setup();
  const coreFocus = (await Feats.findOne(db, { rulesetId: extension.ancestorRulesetIds[0], name: "Spell Focus: Evocation" }))!;
  await FeatsMethods.deleteRulesetFeat(session, extension.id, coreFocus.id);
  const host = await subscribe(session, extension.id);
  await PowersMethods.createRulesetPower(session, host.id, { name: "New Evocation", school: "Evocation", aptitudes: [{ id: wizard.id }] });
  await withRulesetScope(db, host.id, async ({ rulesetData }) => {
    expect(rulesetData.featsById.has(coreFocus.id)).toBe(false);
    expect(rulesetData.feats.some(feat => feat.name === "Spell Focus: Evocation")).toBe(false);
  });
});

test("an independently authored feat occupying a generated name remains independent", async () => {
  const { session, extension, general, wizard } = await setup();
  const independent = await FeatsMethods.createRulesetFeat(session, extension.id, { name: "Spell Focus: Authored School", aptitudeIds: [general.id] });
  const spell = await PowersMethods.createRulesetPower(session, extension.id, { name: "Authored School Spell", school: "Authored School", aptitudes: [{ id: wizard.id }] });
  await PowersMethods.deleteRulesetPower(session, extension.id, spell.id);
  const remaining = await Feats.findOne(db, { id: independent.id });
  expect(remaining?.name).toBe("Spell Focus: Authored School");
});

for (const withVariant of [false, true]) test(`weapon families follow weapon type and restore (inherited variant: ${withVariant})`, async () => {
  const { session, extension, general } = await setup();
  const weapon = await ItemsMethods.createRulesetItem(session, extension.id, { name: "Named Weapon", type: "Weapon", isTemplate: true });
  const property = await PropertiesMethods.createEntityProperty(session, extension.id, "items", weapon.id, { type: "WEAPON_TYPE", value: "Lifecycle Weapon" });
  if (withVariant) await ItemsMethods.createRulesetItem(session, extension.id, {
    name: "Inherited Weapon Variant", type: "Weapon", sourceItemId: weapon.id,
  });
  const featMap = await seedFeats(db, extension.id, { General: general.id }, [{
    name: "Weapon Focus: Lifecycle Weapon", description: "Generated content", aptitudes: ["General"],
    properties: [{ type: "FEAT_FAMILY", value: "Weapon Focus" }],
    modifiers: [{ target: "items.weapons.lifecycleweapon.*.tohit.misc", operator: "add", value: "1", valueType: "number" }],
  }]);
  invalidateAll();
  const featId = featMap["Weapon Focus: Lifecycle Weapon"];
  const host = await subscribe(session, extension.id);
  await FeatsMethods.updateRulesetFeat(session, host.id, featId, { name: "Renamed Weapon Focus" });
  await ItemsMethods.updateRulesetItem(session, host.id, weapon.id, { name: "Heirloom Weapon" });
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.get(featId)?.name).toBe("Renamed Weapon Focus"));
  const second = await ItemsMethods.createRulesetItem(session, host.id, { name: "Other Weapon", type: "Weapon" });
  await PropertiesMethods.createEntityProperty(session, host.id, "items", second.id, { type: "WEAPON_TYPE", value: "Lifecycle Weapon" });
  // Use the copied property ID after the earlier item-name COW.
  const resolved = await ItemsMethods.getRulesetItem(host.id, weapon.id);
  const copiedProperty = resolved.properties.find(row => row.type === property.type)!;
  await PropertiesMethods.updateEntityProperty(session, host.id, "items", resolved.id, copiedProperty.id, { type: "WEAPON_TYPE", value: "Different Weapon" });
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(featId)).toBe(true));
  await ItemsMethods.deleteRulesetItem(session, host.id, second.id);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(featId)).toBe(false));
  await RulesetsMethods.revertOverride(session, host.id, "items", weapon.id);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(featId)).toBe(false));
  await RulesetsMethods.revertOverride(session, host.id, "feats", featId);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => expect(rulesetData.featsById.get(featId)?.id).toBe(featId));
});
