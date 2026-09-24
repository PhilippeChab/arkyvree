import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { SPELL_AREA_OF_EFFECT, SPELL_CASTING_TIME, SPELL_COMPONENT, SPELL_DESCRIPTOR, SPELL_DURATION, SPELL_RANGE_TYPE, SPELL_RESISTANCE, SPELL_SCHOOL, SPELL_SUBSCHOOL, SPELL_TARGET } from "@/server/rulesets/dnd3.5/properties/index.ts";

export interface SpellFields {
  school: string;
  subschool?: string;
  descriptors?: string[];
  castingTime?: string;
  rangeType?: string;
  target?: string;
  areaOfEffect?: string;
  duration?: string;
  spellResistance?: string;
  components?: string[];
}

export async function generateSpellProperties(tx: Db, powerId: string, fields: SpellFields) {
  const props: { entityId: string; entityType: string; type: string; value: string }[] = [];

  const add = (type: string, value: string | undefined) => {
    if (value) props.push({ entityId: powerId, entityType: "powers", type, value });
  };

  add(SPELL_SCHOOL, fields.school);
  add(SPELL_SUBSCHOOL, fields.subschool);
  add(SPELL_CASTING_TIME, fields.castingTime);
  add(SPELL_RANGE_TYPE, fields.rangeType);
  add(SPELL_TARGET, fields.target);
  add(SPELL_AREA_OF_EFFECT, fields.areaOfEffect);
  add(SPELL_DURATION, fields.duration);
  add(SPELL_RESISTANCE, fields.spellResistance);

  for (const descriptor of fields.descriptors ?? []) {
    props.push({ entityId: powerId, entityType: "powers", type: SPELL_DESCRIPTOR, value: descriptor });
  }

  for (const component of fields.components ?? []) {
    props.push({ entityId: powerId, entityType: "powers", type: SPELL_COMPONENT, value: component });
  }

  if (props.length > 0) {
    await Properties.createMany(tx, props);
  }
}
