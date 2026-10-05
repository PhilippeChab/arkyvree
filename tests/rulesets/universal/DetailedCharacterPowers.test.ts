import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Powers, Properties } from "@/server/repositories/index.ts";
import { getStaticPropertyValues } from "@/server/rulesets/dnd3.5/PropertyTypes.ts";
import DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import { SPELL_COMPONENT, SPELL_DESCRIPTOR, SPELL_TARGET } from "@/shared/dnd3.5/properties/index.ts";
import { getSeedCtx } from "@/tests/helpers.ts";

describe("DetailedCharacterPowers.addPowerEntries", () => {
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
    const powers = new DetailedCharacterPowers(getStaticPropertyValues);
    powers.addPowerEntries([{ ...enthrall, properties }]);

    expect(powers.getPower("Enthrall")?.properties).toMatchObject({
      [SPELL_COMPONENT]: "Verbal, Somatic, Chanting",
      [SPELL_DESCRIPTOR]: "Language-Dependent, Mind-Affecting, Sonic",
      [SPELL_TARGET]: "Any number of creatures, One creature",
    });
  });
});
