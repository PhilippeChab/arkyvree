import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Powers, Properties } from "@/server/repositories/index.ts";
import PowersComponent from "@/server/rulesets/dnd3.5/powers/PowersComponent.ts";
import {
  getStaticPropertyValues,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_TARGET,
} from "@/shared/dnd3.5/properties/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

describe("PowersComponent.addPowerEntries", () => {
  test("lists a spell's values of a type in its options' order, whatever order their rows are in", async () => {
    const { rulesetId } = await getSeedCtx();
    const enthrall = (await Powers.findOne(db, { name: "Enthrall", rulesetId }))!;
    const stored = await Properties.findMany(db, { entityIds: [enthrall.id], entityType: "powers" });
    // Stored backwards, as a copy can hold them, with a value no option names, and a second value of a free-text type
    // (Enthrall's target: "Any number of creatures")
    const properties = [
      ...stored.toReversed(),
      { ...stored[0], type: SPELL_COMPONENT, value: "Chanting" },
      { ...stored[0], type: SPELL_TARGET, value: "One creature" },
    ];
    const powers = new PowersComponent(getStaticPropertyValues);
    powers.addPowerEntries([{ ...enthrall, properties }]);

    // Each type's values a list, which a requirement asks one of, and a sheet's line joined
    expect(powers.getPower("Enthrall")?.properties).toMatchObject({
      [SPELL_COMPONENT]: ["Verbal", "Somatic", "Chanting"],
      [SPELL_DESCRIPTOR]: ["Language-Dependent", "Mind-Affecting", "Sonic"],
      [SPELL_TARGET]: ["Any number of creatures", "One creature"],
    });
    expect(powers.getFlatPowers()["enthrall"].properties).toMatchObject({
      [SPELL_COMPONENT]: "Verbal, Somatic, Chanting",
      [SPELL_DESCRIPTOR]: "Language-Dependent, Mind-Affecting, Sonic",
      [SPELL_TARGET]: "Any number of creatures, One creature",
    });
  });
});
