/** What a ruleset's base rules are, as v1 answers them: kinds, fields, tiers, progression's names, character form. */

import type { z } from "zod";

import type { v1Rules } from "@/server/routers/v1/schemas/rules.ts";
import type { RulesService } from "@/server/services/rules/index.ts";

/** A field a kind declares, as the engine describes it. */
type RulesField = NonNullable<RulesDescription["fields"][string]>[number];

/** What one base rules' rulesets are made of, as the engine describes it. */
export type RulesDescription = ReturnType<typeof RulesService.getRules>[keyof ReturnType<typeof RulesService.getRules>];

/** A field as its form shows it, without the word a progression's form says itself in, which v1 names none of. */
function toV1Field(field: RulesField) {
  if (field.input !== "progression") return { ...field };
  const { positionWord: _positionWord, ...shown } = field;
  return shown;
}

/**
 * One base rules' description: what v1 names of it, its kinds' parts as the engine describes them (the tables a
 * progressing kind answers, the kind each owns, its customization pages' owner), and the kinds it customizes.
 */
function toV1RulesDescription(rules: RulesDescription): z.infer<typeof v1Rules>[string] {
  const { counts, grants } = rules.progression;
  return {
    characterForm: { sections: rules.characterForm.sections.map((section) => ({ ...section })) },
    characterKinds: rules.entityKinds.map(({ label, value }) => ({ label, value })),
    customizable: [...rules.customizable],
    fields: Object.fromEntries(
      Object.entries(rules.fields).map(([kind, fields]) => [kind, (fields ?? []).map(toV1Field)]),
    ),
    importers: [...rules.importers],
    kinds: rules.kinds.map((kind) => ({
      families: kind.families ?? false,
      links: kind.links ? { role: kind.links.role, type: kind.links.type } : null,
      owns: rules.customizationPages.find(({ owner }) => owner === kind.type)?.type ?? null,
      partitioned: kind.partitioned ?? false,
      pools: kind.pools ? { role: kind.pools.role, scope: kind.pools.scope, type: kind.pools.type } : null,
      progression: kind.opens === "progression",
      readOnly: kind.readOnly ?? false,
      tables: [...(kind.tables ?? [])],
      templates: kind.copies?.template !== undefined,
      tiered: kind.tiered ?? false,
      type: kind.type,
    })),
    progression: {
      list: counts?.list ?? null,
      picks: grants?.picks ?? null,
      refusal: counts?.refusal ?? null,
      several: counts?.several ?? null,
    },
    tiers: rules.tiers.map(({ label, tier }) => ({ label, tier })),
  };
}

/**
 * The keys a progression's answer holds its rules' values at, past its pools, as v1's rules name them for its base rules
 * (`rules`, their description: `GET /v1/rules`' `progression`): the only ones v1's progression answers.
 */
export function listV1ProgressionKeys(rules: RulesDescription): string[] {
  return Object.values(toV1RulesDescription(rules).progression).flatMap((key) => key ?? []);
}

/** Each base rules' description, by its name. */
export function toV1Rules(rules: ReturnType<typeof RulesService.getRules>): z.infer<typeof v1Rules> {
  return Object.fromEntries(Object.entries(rules).map(([baseRules, rule]) => [baseRules, toV1RulesDescription(rule)]));
}
