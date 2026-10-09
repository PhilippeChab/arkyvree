import { describe, expect, test } from "bun:test";

import { PropertyOrder } from "@/engine/core/customizations/index.ts";
import Dnd35PropertyTypes from "@/engine/rulesets/dnd3.5/Dnd35PropertyTypes.ts";
import {
  DAMAGE_TYPE,
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
} from "@/shared/dnd3.5/properties/index.ts";

/** Properties in the 3.5 rules' stat-block order. */
const ORDER = new PropertyOrder(new Dnd35PropertyTypes());

describe("Properties", () => {
  test("come in a stat block's order of types, each type's values in its options' order", () => {
    const fireball = [
      { type: SPELL_RESISTANCE, value: "Yes" },
      { type: SPELL_AREA_OF_EFFECT, value: "20-ft.-radius spread" },
      { type: SPELL_COMPONENT, value: "Material" },
      { type: SPELL_DURATION, value: "Instantaneous" },
      { type: SPELL_COMPONENT, value: "Verbal" },
      { type: SPELL_CASTING_TIME, value: "1 standard action" },
      { type: SPELL_RANGE_TYPE, value: "Long" },
      { type: SPELL_DESCRIPTOR, value: "Fire" },
      { type: SPELL_COMPONENT, value: "Somatic" },
      { type: SPELL_SCHOOL, value: "Evocation" },
      { type: "HOMEBREW_NOTE", value: "Loud" },
    ];
    expect(ORDER.sort(fireball).map(({ type, value }) => `${type}:${value}`)).toEqual([
      `${SPELL_SCHOOL}:Evocation`,
      `${SPELL_DESCRIPTOR}:Fire`,
      `${SPELL_COMPONENT}:Verbal`,
      `${SPELL_COMPONENT}:Somatic`,
      `${SPELL_COMPONENT}:Material`,
      `${SPELL_CASTING_TIME}:1 standard action`,
      `${SPELL_RANGE_TYPE}:Long`,
      `${SPELL_AREA_OF_EFFECT}:20-ft.-radius spread`,
      `${SPELL_DURATION}:Instantaneous`,
      `${SPELL_RESISTANCE}:Yes`,
      "HOMEBREW_NOTE:Loud",
    ]);
  });

  test("give a weapon's damage types in the rules' order: an urgrosh's Slashing, Piercing", () => {
    const urgrosh = [
      { type: DAMAGE_TYPE, value: "Piercing" },
      { type: DAMAGE_TYPE, value: "Slashing" },
    ];
    expect(ORDER.sort(urgrosh).map((property) => property.value)).toEqual(["Slashing", "Piercing"]);
  });
});
