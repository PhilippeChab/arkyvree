import { powersInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import {
  Aptitudes,
  Feats,
  FeatsAptitudes,
  Modifiers,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import { deleteModifiersWithCascade } from "@/server/services/rulesets/cow.ts";
import {
  FEAT_FAMILY,
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
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { and, eq, inArray, isNull } from "drizzle-orm";

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

export async function generateSpellFocusFeats(tx: Db, rulesetId: string, sourceChain: string[], schoolName: string) {
  // Check child and all ancestors for existing feat
  let existing = await Feats.findOne(tx, { name: `Spell Focus: ${schoolName}`, rulesetId });
  if (!existing) {
    for (const ancestorId of sourceChain) {
      existing = await Feats.findOne(tx, { name: `Spell Focus: ${schoolName}`, rulesetId: ancestorId });
      if (existing) break;
    }
  }
  if (existing) return;

  let generalAptitude = await Aptitudes.findOne(tx, { name: "General", rulesetId });
  if (!generalAptitude) {
    for (const ancestorId of sourceChain) {
      generalAptitude = await Aptitudes.findOne(tx, { name: "General", rulesetId: ancestorId });
      if (generalAptitude) break;
    }
  }
  if (!generalAptitude) return;

  const strippedSchool = stripSeparators(schoolName);

  // Create Spell Focus feat
  const [spellFocus] = await Feats.create(tx, {
    name: `Spell Focus: ${schoolName}`,
    description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}.`,
    rulesetId,
  });

  await FeatsAptitudes.create(tx, { featId: spellFocus.id, aptitudeId: generalAptitude.id });

  await Modifiers.createMany(tx, [{
    sourceId: spellFocus.id,
    sourceType: "feats",
    target: `powers.groups.${strippedSchool}.*.dc.misc`,
    operator: "add",
    value: "1",
    valueType: "number",
  }]);

  await Properties.createMany(tx, [
    { entityId: spellFocus.id, entityType: "feats", type: FEAT_FAMILY, value: "Spell Focus" },
  ]);

  // Create Greater Spell Focus feat
  const [greaterSpellFocus] = await Feats.create(tx, {
    name: `Greater Spell Focus: ${schoolName}`,
    description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${schoolName}. This bonus stacks with Spell Focus.`,
    rulesetId,
  });

  await FeatsAptitudes.create(tx, { featId: greaterSpellFocus.id, aptitudeId: generalAptitude.id });

  await Modifiers.createMany(tx, [{
    sourceId: greaterSpellFocus.id,
    sourceType: "feats",
    target: `powers.groups.${strippedSchool}.*.dc.misc`,
    operator: "add",
    value: "1",
    valueType: "number",
  }]);

  await Properties.createMany(tx, [
    { entityId: greaterSpellFocus.id, entityType: "feats", type: FEAT_FAMILY, value: "Greater Spell Focus" },
  ]);

  await Requirements.createMany(tx, [{
    entityId: greaterSpellFocus.id,
    entityType: "feats",
    level: "1",
    target: `feats.spellfocus${strippedSchool}.possessed`,
    operator: "equal",
    value: "true",
    valueType: "boolean",
  }]);
}

export async function deleteSpellFocusFeats(tx: Db, rulesetId: string, sourceChain: string[], schoolName: string) {
  // Check if any remaining powers in the ruleset (or ancestors) still have this school
  const rulesetIds = [rulesetId, ...sourceChain];
  const remainingSchoolProps = await tx
    .select({ id: propertiesInCustomization.id })
    .from(propertiesInCustomization)
    .innerJoin(powersInRules, eq(propertiesInCustomization.entityId, powersInRules.id))
    .where(and(
      inArray(powersInRules.rulesetId, rulesetIds),
      eq(propertiesInCustomization.entityType, "powers"),
      eq(propertiesInCustomization.type, SPELL_SCHOOL),
      eq(propertiesInCustomization.value, schoolName),
      isNull(powersInRules.deletedAt),
      isNull(propertiesInCustomization.deletedAt),
    ))
    .limit(1);

  if (remainingSchoolProps.length > 0) return;

  // No remaining spells with this school — delete both feats
  for (const featName of [`Spell Focus: ${schoolName}`, `Greater Spell Focus: ${schoolName}`]) {
    let feat = await Feats.findOne(tx, { name: featName, rulesetId });
    if (!feat) {
      for (const ancestorId of sourceChain) {
        feat = await Feats.findOne(tx, { name: featName, rulesetId: ancestorId });
        if (feat) break;
      }
    }
    if (!feat) continue;

    await deleteModifiersWithCascade(tx, { sourceIds: [feat.id], sourceType: "feats" });
    await Requirements.deleteMany(tx, { entityIds: [feat.id], entityType: "feats" });
    await Properties.deleteMany(tx, { entityIds: [feat.id], entityType: "feats" });
    // Hard-delete: FK CASCADE on feats_aptitudes wipes the aptitude link.
    // Soft-archive would block a future generateSpellFocusFeats for the same
    // school (the unique index on feats doesn't filter deleted_at).
    await Feats.delete(tx, { id: feat.id });
  }
}
