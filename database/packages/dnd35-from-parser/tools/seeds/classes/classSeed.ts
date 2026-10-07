/** A class reference's seed: what its file holds, each field its overrides' or else what's detected. */

import {
  buildClassAptitudePicks,
  getClassAptitudePicks,
} from "@/database/packages/dnd35-from-parser/tools/seeds/classes/aptitudePicks.ts";
import { buildClassFeatures } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/features.ts";
import { buildClassModifiers } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/modifiers.ts";
import { getClassSpells } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/spellSlots.ts";
import { resolveFamilyChecks } from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";
import TemplateFamilies from "@/database/packages/dnd35-from-parser/tools/seeds/TemplateFamilies.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A class's spellcasting: its bonus spells' ability and its caster type, which one without the other refuses. */
function buildClassCasting(ref: ClassReference): Pick<ClassSeed, "bonusSpellAbility" | "casterType"> {
  const overrides = ref.overrides ?? {};
  const bonusSpellAbility = overrides.bonusSpellAbility ?? ref.mapping.bonusSpellAbility;
  const casterType = overrides.casterType ?? ref.detected.casterType;
  if (bonusSpellAbility && !casterType) {
    throw new Error(`${ref.raw.name}: has bonusSpellAbility ("${bonusSpellAbility}") but no casterType`);
  }
  if (casterType && !bonusSpellAbility) {
    throw new Error(`${ref.raw.name}: has casterType ("${casterType}") but no bonusSpellAbility`);
  }
  return { ...(bonusSpellAbility ? { bonusSpellAbility } : {}), ...(casterType ? { casterType } : {}) };
}

/** A class's spells: its slots per day and spells known by level, and the lists it casts from. None without slots. */
function buildClassSpells(ref: ClassReference): ClassSeed["spells"] {
  const spells = getClassSpells(ref);
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
  const overrides = ref.overrides ?? {};
  const requirements = resolveFamilyChecks(
    overrides.requirements ?? detected.requirements,
    TemplateFamilies.requirable(ref._meta.book),
  );
  const picks = getClassAptitudePicks(ref);
  const { classFeatures, autoFreeFeats } = buildClassFeatures(ref, picks.perLevel);
  const freeFeats = [...(overrides.freeFeats ?? []), ...autoFreeFeats];
  const casting = buildClassCasting(ref);
  const spells = buildClassSpells(ref);
  const modifiers = buildClassModifiers(ref);
  const aptitudePicks = buildClassAptitudePicks(ref, picks);
  return {
    name: raw.name,
    description: normalizeDescription(overrides.description ?? raw.description),
    hd: detected.hd,
    levels: detected.levels,
    skillPoints: detected.skillPoints,
    bab: overrides.bab ?? detected.bab,
    saves: overrides.saves ?? detected.saves,
    classSkills: overrides.classSkills ?? raw.classSkills,
    requirements,
    ...(detected.casterLevelAdvancement ? { casterLevelAdvancement: detected.casterLevelAdvancement } : {}),
    ...(mapping.classFeatureAptitude ? { classFeatureAptitude: mapping.classFeatureAptitude } : {}),
    ...(classFeatures.length > 0 ? { classFeatures } : {}),
    ...(overrides.proficiencies?.length ? { proficiencies: overrides.proficiencies } : {}),
    ...(freeFeats.length > 0 ? { freeFeats } : {}),
    ...casting,
    ...(spells ? { spells } : {}),
    ...(modifiers.length > 0 ? { modifiers } : {}),
    ...(aptitudePicks.length > 0 ? { aptitudePicks } : {}),
  };
}
