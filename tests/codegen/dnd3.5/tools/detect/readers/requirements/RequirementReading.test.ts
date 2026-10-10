import { describe, expect, test } from "bun:test";

import { ClassPrerequisites } from "@/codegen/dnd3.5/tools/detect/readers/requirements/ClassPrerequisites.ts";
import { FeatPrerequisites } from "@/codegen/dnd3.5/tools/detect/readers/requirements/FeatPrerequisites.ts";
import { eq, eqStr, gte, or } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";
import { proficiencyRequirements } from "@/content/dnd3.5/builders/items/proficiencies.ts";

/** The race's size a prerequisite checks. */
const SIZE = "identity.physiology.race.size";

/** A class whose prerequisites are `parsed`, read. */
function classPrerequisites(parsed: ConstructorParameters<typeof ClassPrerequisites>[0]) {
  return new ClassPrerequisites(parsed);
}

/** The requirements a feat whose prerequisite text is `text` gives. */
function featRequirements(text: string) {
  return new FeatPrerequisites({ name: "Feat", featType: "general", prerequisiteText: text, benefit: "", special: "" })
    .requirements;
}

/** The requirements a class whose special prerequisite is `text` gives. */
function specialRequirements(text: string) {
  return classPrerequisites({ special: [text] }).requirements;
}

describe("A prerequisite a feat and a class share", () => {
  test("asking to cast spells of a level or a kind is that spellcasting", () => {
    expect(featRequirements("Ability to cast 3rd-level arcane spells,")).toEqual([gte("spellcasting.arcane", 3)]);
    expect(specialRequirements("Ability to cast 3rd-level arcane spells.")).toEqual([gte("spellcasting.arcane", 3)]);
    expect(featRequirements("able to cast divine spells,")).toEqual([gte("spellcasting.divine", 1)]);
    expect(specialRequirements("Ability to cast 3rd-level spells.")).toEqual([
      or(gte("spellcasting.arcane", 3), gte("spellcasting.divine", 3)),
    ]);
  });

  test("of a caster level is the highest caster level, of either kind or arcane, not a spell level", () => {
    expect(featRequirements("Caster level 5th,")).toEqual([gte("spellcasting.casterlevel", 5)]);
    expect(featRequirements("Spell Focus (necromancy), caster level 7th,")).toEqual([
      eq(feat("Spell Focus: Necromancy")),
      gte("spellcasting.casterlevel", 7),
    ]);
    expect(featRequirements("Knowledge (arcana) 4 ranks, arcane caster level 3rd,")).toEqual([
      gte("spellcasting.arcanecasterlevel", 3),
      gte("skills.knowledgearcana.rank", 4),
    ]);
    expect(specialRequirements("Arcane caster level 5th.Special: Sneak attack +1d6.")).toEqual([
      gte("spellcasting.arcanecasterlevel", 5),
      gte("feats.sneakattack.count", 1),
    ]);
    expect(specialRequirements("Caster level 5th.")).toEqual([gte("spellcasting.casterlevel", 5)]);
  });

  test("a class's Spells line asks its caster level after its spell levels, which it doesn't read again", () => {
    expect(
      classPrerequisites({ spells: ["Able to cast charm person, or use the charm invocation.", "Caster level 5th."] })
        .requirements,
    ).toEqual([gte("spellcasting.casterlevel", 5)]);
    expect(
      classPrerequisites({
        alignment: "Any nongood",
        casterLevel: [{ level: 2, type: "arcane" }],
        spells: ["Able to cast 2nd-level arcane spells.", "Arcane caster level 5th."],
      }).requirements.slice(0, 2),
    ).toEqual([gte("spellcasting.arcane", 2), gte("spellcasting.arcanecasterlevel", 5)]);
  });

  test("asking to cast a spell it names is any spellcasting, but not an ability to use, nor casting it rules out", () => {
    const anyCasting = or(gte("spellcasting.arcane", 1), gte("spellcasting.divine", 1));
    expect(featRequirements("able to cast any cure wounds spell,")).toEqual([anyCasting]);
    expect(specialRequirements("Ability to cast summon monster III")).toEqual([anyCasting]);
    expect(featRequirements("Ability to use lesser invocations,")).toEqual([]);
    expect(specialRequirements("Able to use lesser invocations.")).toEqual([]);
    expect(specialRequirements("The character must have no ability to cast divine spells.")).toEqual([]);
  });

  test("of a size is that size, either of two, or it and those smaller or larger", () => {
    const sizes = (...names: string[]) => or(...names.map((name) => eqStr(SIZE, name)));
    expect(featRequirements("Large size or larger,")).toEqual([sizes("Large", "Huge", "Gargantuan", "Colossal")]);
    expect(specialRequirements("Large size or larger.")).toEqual([sizes("Large", "Huge", "Gargantuan", "Colossal")]);
    expect(featRequirements("Medium or smaller size,")).toEqual([
      sizes("Fine", "Diminutive", "Tiny", "Small", "Medium"),
    ]);
    expect(specialRequirements("Small or Medium size.")).toEqual([sizes("Small", "Medium")]);
    expect(featRequirements("Small size,")).toEqual([eqStr(SIZE, "Small")]);
  });

  test("asking for any feat of a family is any of the family's feats", () => {
    expect(featRequirements("any metamagic feat,")).toEqual([eq("feats.metamagic.*.possessed")]);
    expect(specialRequirements("Any metamagic feat.")).toEqual([eq("feats.metamagic.*.possessed")]);
    expect(featRequirements("Weapon Focus (any thrown weapon),")).toEqual([eq("feats.weaponfocus.*.possessed")]);
    expect(classPrerequisites({ feats: ["Weapon Focus (any thrown weapon)"] }).requirements).toEqual([
      eq("feats.weaponfocus.*.possessed"),
    ]);
    expect(featRequirements("Spell Focus (two schools of magic),")).toEqual([gte("feats.spellfocus.count", 2)]);
  });

  test("of an exotic weapon's proficiency is the proficiency its item requires", () => {
    // The kukri is exotic as a feat names it, and martial in the weapon table
    expect(featRequirements("Exotic Weapon Proficiency (kukri),")).toEqual(proficiencyRequirements("Kukri"));
    expect(classPrerequisites({ feats: ["Exotic Weapon Proficiency (kukri)"] }).requirements).toEqual(
      proficiencyRequirements("Kukri"),
    );
    expect(featRequirements("Exotic Weapon Proficiency (net),")).toEqual([eq(feat("Exotic Weapon Proficiency: Net"))]);
  });

  test("of a skill's ranks is any of the options or skills it lists", () => {
    const knowledge = or(
      gte("skills.knowledgearcana.rank", 8),
      gte("skills.knowledgelocal.rank", 8),
      gte("skills.knowledgepsionics.rank", 8),
    );
    expect(featRequirements("Knowledge (arcana, local or psionics) 8 ranks,")).toEqual([knowledge]);
    expect(
      classPrerequisites({ skills: [{ name: "Knowledge (arcana, local or psionics)", ranks: 8 }] }).requirements,
    ).toEqual([knowledge]);
    const persuasion = or(gte("skills.diplomacy.rank", 4), gte("skills.intimidate.rank", 4));
    expect(featRequirements("Diplomacy or Intimidate 4 ranks,")).toEqual([persuasion]);
    expect(classPrerequisites({ skills: [{ name: "Diplomacy or Intimidate", ranks: 4 }] }).requirements).toEqual([
      persuasion,
    ]);
  });
});
