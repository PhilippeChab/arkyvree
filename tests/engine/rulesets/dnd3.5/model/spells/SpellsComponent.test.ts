import { describe, expect, test } from "bun:test";

import type { Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import SpellGroupingsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellGroupingsComponent.ts";
import SpellsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellsComponent.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { writeFieldValues } from "@/tests/support/ownerValues.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import { SPELL_COMPONENT, SPELL_DESCRIPTOR, SPELL_SCHOOL, SPELL_TARGET } from "@/vocabulary/dnd3.5/fields/index.ts";

describe("SpellsComponent.addSpellEntries", () => {
  test("lists a spell's values of a field in its options' order, whatever order they were stored in", async () => {
    const ruleset = await createSeededTestRuleset(makeSession().userId);
    const [spell] = await Entities.createMany<Spell>(db, "spells", [{ name: "Probe Chant", rulesetId: ruleset.id }]);
    // Stored backwards, as a copy can hold them, with a value no option names
    const stored: [string, string][] = [
      [SPELL_SCHOOL, "Enchantment"],
      [SPELL_COMPONENT, "Chanting"],
      [SPELL_COMPONENT, "Somatic"],
      [SPELL_COMPONENT, "Verbal"],
      [SPELL_DESCRIPTOR, "Sonic"],
      [SPELL_DESCRIPTOR, "Mind-Affecting"],
      [SPELL_DESCRIPTOR, "Language-Dependent"],
      [SPELL_TARGET, "Any number of creatures"],
    ];
    await writeFieldValues("spells", spell.id, stored);
    const rulesetData = await RulesetViews.getData(ruleset);
    const spells = new SpellsComponent(new SpellGroupingsComponent(new AbilitiesComponent()));
    spells.addSpellEntries([rulesetData.find("spells", spell.id)!]);

    // Each field's values a list, which a requirement asks one of, and a sheet's line joined
    expect(spells.getSpell("Probe Chant")?.fields).toMatchObject({
      [SPELL_COMPONENT]: ["Verbal", "Somatic", "Chanting"],
      [SPELL_DESCRIPTOR]: ["Language-Dependent", "Mind-Affecting", "Sonic"],
      [SPELL_TARGET]: ["Any number of creatures"],
    });
    expect(spells.getFlatSpells()["probechant"].fields).toMatchObject({
      [SPELL_COMPONENT]: "Verbal, Somatic, Chanting",
      [SPELL_DESCRIPTOR]: "Language-Dependent, Mind-Affecting, Sonic",
      [SPELL_TARGET]: "Any number of creatures",
    });
  });
});
