import { describe, expect, test } from "bun:test";

import { groupClasses, groupSpecies, stripLinks } from "@/codegen/dnd5/tools/scraper/datasets.ts";
import type { ClassEntry, ClassFeature, ClassLevel, SubclassEntry } from "@/codegen/dnd5/tools/types/classes.ts";

/** A class of the database, its subclasses named. */
function classOf(index: string, name: string, subclasses: string[] = []): ClassEntry {
  return {
    hit_die: 10,
    index,
    multi_classing: {},
    name,
    primary_ability: { ability_scores: [], desc: "Strength" },
    proficiencies: [],
    proficiency_choices: [],
    saving_throws: [],
    starting_equipment_options: [],
    subclasses: subclasses.map((sub) => ({ index: sub, name: sub })),
  };
}

/** A feature of `klass` given at `levelSlug`, its subclass's when given. */
function featureOf(klass: string, name: string, levelSlug: string, subclass?: string): ClassFeature {
  return {
    class: { index: klass, name: klass },
    description: `${name}'s text`,
    index: `${klass}-${name}`,
    level: { index: levelSlug, name: levelSlug },
    name,
    ...(subclass ? { subclass: { index: subclass, name: subclass } } : {}),
  };
}

/** A level of `klass`, its subclass's when given. */
function levelOf(klass: string, level: number, subclass?: string): ClassLevel {
  return {
    class: { index: klass, name: klass },
    features: [],
    index: `${subclass ?? klass}-${level}`,
    level,
    name: `${subclass ?? klass} ${level}`,
    ...(subclass ? { subclass: { index: subclass, name: subclass } } : {}),
  };
}

/** A subclass of `klass`. */
function subclassOf(klass: string, index: string): SubclassEntry {
  return { class: { index: klass, name: klass }, description: "", features: [], index, name: index, summary: "" };
}

describe("The 5e-bits database's files, read into references", () => {
  test("gather each class's own levels and features, and each of its subclasses' apart", () => {
    const [fighter] = groupClasses({
      classes: [classOf("fighter", "Fighter", ["champion"]), classOf("wizard", "Wizard")],
      levels: [levelOf("fighter", 3), levelOf("wizard", 1), levelOf("fighter", 1), levelOf("fighter", 3, "champion")],
      features: [
        featureOf("fighter", "Second Wind", "fighter-1"),
        featureOf("fighter", "Remarkable Athlete", "fighter-3", "champion"),
        featureOf("fighter", "Fighter Subclass", "fighter-3"),
        featureOf("fighter", "Action Surge", "fighter-1"),
        featureOf("wizard", "Arcane Recovery", "wizard-1"),
      ],
      subclasses: [subclassOf("fighter", "champion")],
    });
    expect(fighter.levels.map(({ index }) => index)).toEqual(["fighter-1", "fighter-3"]);
    expect(fighter.features.map(({ name }) => name)).toEqual(["Action Surge", "Second Wind", "Fighter Subclass"]);
    expect(fighter.subclasses.map(({ subclass, levels, features }) => [subclass.index, levels, features])).toEqual([
      [
        "champion",
        [levelOf("fighter", 3, "champion")],
        [featureOf("fighter", "Remarkable Athlete", "fighter-3", "champion")],
      ],
    ]);
  });

  test("order a subclass's features by the class level that gives them, then by name", () => {
    const [fighter] = groupClasses({
      classes: [classOf("fighter", "Fighter", ["champion"])],
      levels: [levelOf("fighter", 3), levelOf("fighter", 7)],
      features: [
        featureOf("fighter", "Additional Fighting Style", "fighter-7", "champion"),
        featureOf("fighter", "Remarkable Athlete", "fighter-3", "champion"),
        featureOf("fighter", "Improved Critical", "fighter-3", "champion"),
      ],
      subclasses: [subclassOf("fighter", "champion")],
    });
    expect(fighter.subclasses[0].features.map(({ name }) => name)).toEqual([
      "Improved Critical",
      "Remarkable Athlete",
      "Additional Fighting Style",
    ]);
  });

  test("refuse a class naming a subclass the database lacks", () => {
    expect(() =>
      groupClasses({
        classes: [classOf("fighter", "Fighter", ["champion"])],
        levels: [],
        features: [],
        subclasses: [],
      }),
    ).toThrow('No subclass "champion" (champion)');
  });

  test("read a species' traits and subspecies whole, without their references back to it", () => {
    const darkvision = { description: "You see in the dark.", index: "darkvision", name: "Darkvision" };
    const drow = { description: "Your darkvision reaches farther.", index: "drow-lineage", name: "Drow Lineage" };
    const [elf] = groupSpecies(
      [
        {
          index: "elf",
          name: "Elf",
          size: "Medium",
          speed: 30,
          subspecies: [{ index: "drow", name: "Drow" }],
          traits: [{ index: "darkvision", name: "Darkvision" }],
          type: "Humanoid",
        },
      ],
      [
        {
          index: "drow",
          name: "Drow",
          species: { index: "elf", name: "Elf" },
          traits: [{ index: "drow-lineage", name: "Drow Lineage" }],
        },
      ],
      [
        { ...darkvision, species: [{ index: "elf", name: "Elf" }] },
        { ...drow, subspecies: [{ index: "drow", name: "Drow" }] },
      ],
    );
    expect(elf.traits).toEqual([darkvision]);
    expect(elf.subspecies).toEqual([{ index: "drow", name: "Drow", traits: [drow] }]);
  });

  test("give a species the traits that name it but no species or subspecies lists, after its own", () => {
    const darkvision = { description: "You see in the dark.", index: "darkvision", name: "Darkvision" };
    const ancestry = {
      description: "You have draconic ancestry.",
      index: "draconic-ancestry",
      name: "Draconic Ancestry",
    };
    const dragonborn = { index: "dragonborn", name: "Dragonborn" };
    const [species] = groupSpecies(
      [
        {
          ...dragonborn,
          size: "Medium",
          speed: 30,
          traits: [{ index: "darkvision", name: "Darkvision" }],
          type: "Humanoid",
        },
      ],
      [],
      [
        { ...ancestry, species: [dragonborn] },
        { ...darkvision, species: [dragonborn] },
      ],
    );
    expect(species.traits).toEqual([darkvision, ancestry]);
  });

  test("refuse a species naming a trait the database lacks", () => {
    expect(() =>
      groupSpecies(
        [{ index: "elf", name: "Elf", speed: 30, traits: [{ index: "trance", name: "Trance" }], type: "Humanoid" }],
        [],
        [],
      ),
    ).toThrow('No trait "trance" (Trance)');
  });

  test("leave out the database's links, an entry's own and those naming its API's routes, at any depth", () => {
    expect(
      stripLinks<unknown>({
        class_levels: "/api/2024/classes/fighter/levels",
        index: "fighter",
        name: "Fighter",
        saving_throws: [{ index: "str", name: "STR", url: "/api/2024/ability-scores/str" }],
        url: "/api/2024/classes/fighter",
        image: "/api/images/fighter.png",
      }),
    ).toEqual({ index: "fighter", name: "Fighter", saving_throws: [{ index: "str", name: "STR" }] });
  });
});
