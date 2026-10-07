import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { Feats, FeatsAptitudes, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { NO_FEAT_FIELDS, toFeatProperties } from "@/server/rulesets/dnd3.5/feats/featFields.ts";
import FeatsPaths from "@/server/rulesets/dnd3.5/feats/FeatsPaths.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

export interface SpellFields {
  areaOfEffect?: string;
  castingTime?: string;
  components?: string[];
  descriptors?: string[];
  duration?: string;
  rangeType?: string;
  school: string;
  spellResistance?: string;
  subschool?: string;
  target?: string;
}

/** The property types `generateSpellProperties` writes. */
export const SPELL_FIELD_PROPERTY_TYPES = [
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_CASTING_TIME,
  SPELL_RANGE_TYPE,
  SPELL_TARGET,
  SPELL_AREA_OF_EFFECT,
  SPELL_DURATION,
  SPELL_RESISTANCE,
  SPELL_DESCRIPTOR,
  SPELL_COMPONENT,
] as const;

export async function generateSpellFocusFeats(tx: Db, scope: RulesetScope, schoolName: string) {
  const rulesetId = scope.ruleset.id;
  const { sourceChain } = scope.rulesetData.cow;
  // Check child and all ancestors for existing feat
  let existing = await Feats.findOne(tx, { name: `Spell Focus: ${schoolName}`, rulesetId });
  if (!existing) {
    for (const ancestorId of sourceChain) {
      existing = await Feats.findOne(tx, { name: `Spell Focus: ${schoolName}`, rulesetId: ancestorId });
      if (existing) break;
    }
  }
  if (existing) return;

  const generalAptitudeId = scope.rulesetData.aptitudeIdBySlug.get(Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG);
  if (!generalAptitudeId) return;

  const strippedSchool = stripSeparators(schoolName);

  const [spellFocus] = await Feats.create(tx, {
    name: `Spell Focus: ${schoolName}`,
    description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}.`,
    generated: true,
    rulesetId,
  });

  await FeatsAptitudes.create(tx, { featId: spellFocus.id, aptitudeId: generalAptitudeId });

  await Modifiers.createMany(tx, [
    {
      sourceId: spellFocus.id,
      sourceType: "feats",
      target: `powers.groups.${strippedSchool}.*.dc.misc`,
      operator: "add",
      value: "1",
      valueType: "number",
    },
  ]);

  await Properties.createMany(tx, toFeatProperties(spellFocus.id, { ...NO_FEAT_FIELDS, families: ["Spell Focus"] }));

  const [greaterSpellFocus] = await Feats.create(tx, {
    name: `Greater Spell Focus: ${schoolName}`,
    description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}. This bonus stacks with Spell Focus.`,
    generated: true,
    rulesetId,
  });

  await FeatsAptitudes.create(tx, { featId: greaterSpellFocus.id, aptitudeId: generalAptitudeId });

  await Modifiers.createMany(tx, [
    {
      sourceId: greaterSpellFocus.id,
      sourceType: "feats",
      target: `powers.groups.${strippedSchool}.*.dc.misc`,
      operator: "add",
      value: "1",
      valueType: "number",
    },
  ]);

  await Properties.createMany(
    tx,
    toFeatProperties(greaterSpellFocus.id, { ...NO_FEAT_FIELDS, families: ["Greater Spell Focus"] }),
  );

  await Requirements.createMany(tx, [
    {
      entityId: greaterSpellFocus.id,
      entityType: "feats",
      level: "1",
      target: FeatsPaths.possessed(`spellfocus${strippedSchool}`),
      operator: "equal",
      value: "true",
      valueType: "boolean",
    },
  ]);
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

  for (const descriptor of fields.descriptors ?? [])
    props.push({ entityId: powerId, entityType: "powers", type: SPELL_DESCRIPTOR, value: descriptor });

  for (const component of fields.components ?? [])
    props.push({ entityId: powerId, entityType: "powers", type: SPELL_COMPONENT, value: component });

  if (props.length > 0) await Properties.createMany(tx, props);
}
