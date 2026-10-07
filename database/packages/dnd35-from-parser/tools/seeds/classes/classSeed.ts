/** A class reference's seed: what its file holds, as its mapping (its overrides applied) and its detected section give it. */

import { resolveFamilyChecks } from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";
import TemplateFamilies from "@/database/packages/dnd35-from-parser/tools/seeds/TemplateFamilies.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import { stripSeparators } from "@/shared/text.ts";

import { buildClassAptitudePicks, getClassAptitudePicks } from "./aptitudePicks.ts";
import { buildClassFeatures } from "./features.ts";
import { buildClassModifiers } from "./modifiers.ts";

/** A class's spellcasting: its bonus spells' ability and its caster type, which one without the other refuses. */
function buildClassCasting(ref: ClassReference): Pick<ClassSeed, "bonusSpellAbility" | "casterType"> {
  const { bonusSpellAbility, casterType } = ref.mapping;
  if (bonusSpellAbility && !casterType)
    throw new Error(`${ref.raw.name}: has bonusSpellAbility ("${bonusSpellAbility}") but no casterType`);

  if (casterType && !bonusSpellAbility)
    throw new Error(`${ref.raw.name}: has casterType ("${casterType}") but no bonusSpellAbility`);

  return { ...(bonusSpellAbility ? { bonusSpellAbility } : {}), ...(casterType ? { casterType } : {}) };
}

/** A class's spells: its slots per day and spells known by level, and the lists it casts from. None without slots. */
function buildClassSpells(ref: ClassReference): ClassSeed["spells"] {
  const { spells } = ref.mapping;
  if (!spells) return undefined;
  return {
    slug: spells.slug,
    perDay: spells.perDay,
    ...(spells.known ? { known: spells.known } : {}),
    ...(spells.knowAll && !spells.known ? { knowAll: true } : {}),
    ...(spells.noCantrips ? { noCantrips: true } : {}),
    ...(spells.lists
      ? {
          lists: spells.lists.map((list) => ({ slug: stripSeparators(list.name), requirements: list.requirements })),
        }
      : {}),
  };
}

/**
 * A class reference's seed: its summary (name, description, hit die, levels, skills, BAB, saves, requirements), its
 * features and the feats it grants, its spellcasting, its level modifiers and its aptitude picks. Each is built in the
 * order its file is written, so a class the generator refuses fails on the same field.
 */
export function buildClassSeed(ref: ClassReference): ClassSeed {
  const { detected, mapping, raw } = ref;
  const requirements = resolveFamilyChecks(mapping.requirements, TemplateFamilies.requirable(ref._meta.book));
  const picks = getClassAptitudePicks(ref);
  const { classFeatures, autoFreeFeats } = buildClassFeatures(ref, picks.perLevel);
  const freeFeats = [...(mapping.freeFeats ?? []), ...autoFreeFeats];
  const casting = buildClassCasting(ref);
  const spells = buildClassSpells(ref);
  const modifiers = buildClassModifiers(ref);
  const aptitudePicks = buildClassAptitudePicks(ref, picks);
  return {
    name: raw.name,
    description: normalizeDescription(mapping.description),
    hd: detected.hd,
    levels: detected.levels,
    skillPoints: detected.skillPoints,
    bab: mapping.bab,
    saves: mapping.saves,
    classSkills: mapping.classSkills,
    requirements,
    ...(detected.casterLevelAdvancement ? { casterLevelAdvancement: detected.casterLevelAdvancement } : {}),
    ...(mapping.classFeatureAptitude ? { classFeatureAptitude: mapping.classFeatureAptitude } : {}),
    ...(classFeatures.length > 0 ? { classFeatures } : {}),
    ...(mapping.proficiencies?.length ? { proficiencies: mapping.proficiencies } : {}),
    ...(freeFeats.length > 0 ? { freeFeats } : {}),
    ...casting,
    ...(spells ? { spells } : {}),
    ...(modifiers.length > 0 ? { modifiers } : {}),
    ...(aptitudePicks.length > 0 ? { aptitudePicks } : {}),
  };
}
