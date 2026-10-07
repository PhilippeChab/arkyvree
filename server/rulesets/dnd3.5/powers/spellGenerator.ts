import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { Feats, FeatsAptitudes, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { NO_FEAT_FIELDS, toFeatProperties } from "@/server/rulesets/dnd3.5/feats/featFields.ts";
import FeatsPaths from "@/server/rulesets/dnd3.5/feats/FeatsPaths.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import { stripSeparators } from "@/shared/text.ts";

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
