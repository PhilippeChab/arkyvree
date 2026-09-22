import { describe, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { EntitySnapshots, Items, Sessions, Users } from "@/server/repositories/index.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

async function setup() {
  const user = await Users.findOne(db, { emailAddress: "testuser1@example.com" });
  if (!user) throw new Error("Seed user not found");
  const [session] = await Sessions.create(db, { userId: user.id });
  const ruleset = await createSeededTestRuleset(user.id);
  const templates = await ItemsMethods.getRulesetTemplates(ruleset.id, "Weapon");
  const mace = templates.find((item) => item.name === "Heavy Mace");
  const sword = templates.find((item) => item.name === "Longsword");
  if (!mace || !sword) throw new Error("Seed weapon templates not found");
  return { session, ruleset, mace, sword };
}

describe("Item template sources", () => {
  test("rejects creating a template based on another template", async () => {
    const { session, ruleset, mace } = await setup();

    await expect(ItemsMethods.createRulesetItem(session, ruleset.id, {
      name: "Invalid template",
      type: "Weapon",
      isTemplate: true,
      sourceItemId: mace.id,
    })).rejects.toThrow("Template items cannot have a source item");

    expect(await Items.findOne(db, { rulesetId: ruleset.id, name: "Invalid template" })).toBeUndefined();
  });

  test("allows creating a standalone template", async () => {
    const { session, ruleset } = await setup();

    const item = await ItemsMethods.createRulesetItem(session, ruleset.id, {
      name: "Custom weapon template",
      type: "Weapon",
      isTemplate: true,
    });

    expect(item.isTemplate).toBe(true);
    expect(item.sourceItemId).toBeNull();
  });

  test("rejects an inherited template sourcing itself before creating an override", async () => {
    const { session, ruleset, mace } = await setup();

    await expect(ItemsMethods.updateRulesetItem(session, ruleset.id, mace.id, {
      name: mace.name,
      sourceItemId: mace.id,
    })).rejects.toThrow("Template items cannot have a source item");

    expect(await EntitySnapshots.findBySourceAndRuleset(db, {
      rulesetId: ruleset.id,
      sourceEntityId: mace.id,
    })).toBeUndefined();
    expect((await Items.findOne(db, { id: mace.id }))?.sourceItemId).toBeNull();
  });

  test("uses stored template status even when the update claims it is a regular item", async () => {
    const { session, ruleset, mace, sword } = await setup();
    const template = await ItemsMethods.updateRulesetItem(session, ruleset.id, mace.id, {
      name: mace.name,
      description: "Local template",
    });

    await expect(ItemsMethods.updateRulesetItem(session, ruleset.id, template.id, {
      name: template.name,
      isTemplate: false,
      sourceItemId: sword.id,
    })).rejects.toThrow("Template items cannot have a source item");

    const unchanged = await Items.findOne(db, { id: template.id });
    expect(unchanged?.isTemplate).toBe(true);
    expect(unchanged?.sourceItemId).toBeNull();
  });

  test("keeps templates editable without adding a source or changing the original", async () => {
    const { session, ruleset, mace } = await setup();

    const edited = await ItemsMethods.updateRulesetItem(session, ruleset.id, mace.id, {
      name: mace.name,
      type: "Weapon",
      weight: 10,
      description: "Heavier homebrew mace",
    });

    expect(edited.id).not.toBe(mace.id);
    expect(edited.isTemplate).toBe(true);
    expect(edited.sourceItemId).toBeNull();
    expect(edited.weight).toBe("10.00");
    expect(edited.description).toBe("Heavier homebrew mace");
    expect((await Items.findOne(db, { id: mace.id }))?.weight).toBe(mace.weight);
  });

  test("clears a legacy template self-reference when saving its details", async () => {
    const { session, ruleset, mace } = await setup();
    const template = await ItemsMethods.updateRulesetItem(session, ruleset.id, mace.id, {
      name: mace.name,
    });
    await Items.update(db, { sourceItemId: template.id }, { id: template.id });

    const edited = await ItemsMethods.updateRulesetItem(session, ruleset.id, template.id, {
      name: template.name,
      description: "Updated template",
    });

    expect(edited.isTemplate).toBe(true);
    expect(edited.sourceItemId).toBeNull();
  });

  test("regular items can still be duplicated from templates and change their source", async () => {
    const { session, ruleset, mace, sword } = await setup();
    const copy = await ItemsMethods.duplicateRulesetItem(session, ruleset.id, mace.id, {
      name: "Custom weapon",
      type: "Weapon",
    });
    expect(copy.isTemplate).toBe(false);
    expect(copy.sourceItemId).toBe(mace.id);

    const edited = await ItemsMethods.updateRulesetItem(session, ruleset.id, copy.id, {
      name: copy.name,
      sourceItemId: sword.id,
    });
    expect(edited.isTemplate).toBe(false);
    expect(edited.sourceItemId).toBe(sword.id);

    const view = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);
    expect(view.properties.find((property) => property.type === "WEAPON_TYPE")?.value).toBe("Longsword");
  });
});
