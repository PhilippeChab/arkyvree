import { describe, expect, test } from "bun:test";

import type { Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import SpellGroupingsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellGroupingsComponent.ts";
import SpellsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellsComponent.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Properties } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { SPELL_COMPONENT, SPELL_DESCRIPTOR, SPELL_TARGET } from "@/vocabulary/dnd3.5/properties/index.ts";

describe("SpellsComponent.addSpellEntries", () => {
  test("lists a spell's values of a type in its options' order, whatever order their rows are in", async () => {
    const { rulesetId } = await getSeedCtx();
    const enthrall = (await Entities.findOne<Spell>(db, { entityType: "spells", name: "Enthrall", rulesetId }))!;
    const stored = await Properties.findMany(db, { entityIds: [enthrall.id], entityType: "spells" });
    // Stored backwards, as a copy can hold them, with a value no option names, and a second value of a free-text type
    // (Enthrall's target: "Any number of creatures")
    const properties = [
      ...stored.toReversed(),
      { ...stored[0], type: SPELL_COMPONENT, value: "Chanting" },
      { ...stored[0], type: SPELL_TARGET, value: "One creature" },
    ];
    const spells = new SpellsComponent(new SpellGroupingsComponent(new AbilitiesComponent()));
    spells.addSpellEntries([{ ...enthrall, properties }]);

    // Each type's values a list, which a requirement asks one of, and a sheet's line joined
    expect(spells.getSpell("Enthrall")?.properties).toMatchObject({
      [SPELL_COMPONENT]: ["Verbal", "Somatic", "Chanting"],
      [SPELL_DESCRIPTOR]: ["Language-Dependent", "Mind-Affecting", "Sonic"],
      [SPELL_TARGET]: ["Any number of creatures", "One creature"],
    });
    expect(spells.getFlatSpells()["enthrall"].properties).toMatchObject({
      [SPELL_COMPONENT]: "Verbal, Somatic, Chanting",
      [SPELL_DESCRIPTOR]: "Language-Dependent, Mind-Affecting, Sonic",
      [SPELL_TARGET]: "Any number of creatures, One creature",
    });
  });
});
