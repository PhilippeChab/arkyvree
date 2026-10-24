import { describe, expect, test } from "bun:test";

import { expectOk, guestApi } from "@/tests/support/api.ts";

describe("rules", () => {
  test("answers what every base rules' rulesets share, to anyone: words, kinds, levels, lists, progression, level wizard, a new character's form and license", async () => {
    const rules = await expectOk(guestApi.api.rules.$get());
    const dnd35 = rules["Dungeons & Dragons: 3.5"];
    // Its word for every type, the engine's own (modifiers) with its own
    expect(dnd35.words.powers).toEqual({ many: "Spells", one: "Spell" });
    expect(dnd35.words.klasses).toEqual({ many: "Classes", one: "Class" });
    expect(dnd35.words.modifiers).toEqual({ many: "Modifiers", one: "Modifier" });
    // Its kinds, in its page's order: each its picture, and its tab's help where it has one
    expect(dnd35.kinds.map(({ type }) => type)).toEqual([
      "races",
      "languages",
      "skills",
      "feats",
      "powers",
      "items",
      "aptitudes",
      "klasses",
      "saves",
      "abilities",
      "mechanics",
    ]);
    expect(dnd35.kinds.filter((kind) => kind.help).map(({ type }) => type)).toEqual(["aptitudes", "mechanics"]);
    // Every kind has its word and its list
    for (const { type } of dnd35.kinds) {
      expect(dnd35.words[type]).toBeDefined();
      expect(dnd35.lists[type]).toBeDefined();
    }
    // A new character's form: its sections, and its fields by the keys its create sends them
    expect(dnd35.characterForm.sections.map(({ title }) => title)).toEqual([
      "Basic Information",
      "Ability Scores",
      "Physical Details",
      "Optional Details",
    ]);
    expect(
      dnd35.characterForm.sections.flatMap((section) =>
        section.kind === "fields"
          ? section.lines
              .flat()
              .map((item) => ("key" in item ? item.key : item.kind === "pick" ? item.column : item.kind))
          : [],
      ),
    ).toEqual([
      "name",
      "xp",
      "ruleset",
      "raceId",
      "alignment",
      "gender",
      "age",
      "height",
      "weight",
      "deity",
      "description",
      "notes",
    ]);
    // And what its row opens
    expect(Object.fromEntries(dnd35.kinds.map(({ opens, type }) => [type, opens]))).toEqual({
      races: "customization",
      languages: "page",
      skills: "page",
      feats: "customization",
      powers: "customization",
      items: "customization",
      aptitudes: "page",
      klasses: "progression",
      saves: "page",
      abilities: "page",
      mechanics: "page",
    });
    // The kinds whose customizations have a page of their own: a class's level by its class (named at its owner's key),
    // a class's on its own page
    expect(dnd35.customizationPages).toEqual([
      { type: "feats" },
      { type: "powers" },
      { type: "items" },
      { type: "races" },
      { type: "klass_levels", owner: "klasses", ownerKey: "klassId" },
    ]);
    // A kind that opens a customization page is one such a page shows, and every kind one shows but an owned kind's
    // (which no tab lists) opens it
    const customized = dnd35.kinds.filter(({ opens }) => opens === "customization").map(({ type }) => type);
    const pages = dnd35.customizationPages.filter(({ owner }) => !owner).map(({ type }) => type);
    expect(customized.toSorted()).toEqual(pages.toSorted());
    // Races and classes narrow by what they're for, abilities take no form, an empty list of saves its own words
    expect(dnd35.kinds.filter((kind) => kind.partitioned).map(({ type }) => type)).toEqual(["races", "klasses"]);
    expect(dnd35.kinds.filter((kind) => kind.readOnly).map(({ type }) => type)).toEqual(["abilities"]);
    // A class's new one's form says what each field is for, a mechanic's gives its description room
    expect(dnd35.kinds.filter((kind) => kind.fieldHelp).map(({ type }) => type)).toEqual(["klasses"]);
    expect(dnd35.kinds.filter((kind) => kind.longDescription).map(({ type }) => type)).toEqual(["mechanics"]);
    expect(dnd35.kinds.find((kind) => kind.type === "saves")?.empty).toBe(
      "No saving throws available for this ruleset.",
    );
    expect(dnd35.entityKinds).toEqual([
      { label: "Player Character", value: "pc" },
      { label: "Familiar", value: "familiar" },
      { label: "Animal Companion", value: "animalcompanion" },
      { label: "Special Mount", value: "mount" },
    ]);
    expect(dnd35.progression.lastLevel).toBe(20);
    expect(dnd35.tiers.at(0)).toEqual({ label: "Cantrips", level: 0 });
    expect(dnd35.tiers.at(-1)).toEqual({ label: "Level 9", level: 9 });
    expect(dnd35.license).toMatchObject({ text: "ogl" });
    // Its lists: a class's hit die as dice notation, an item's cost and weight in their units
    expect(dnd35.lists.klasses?.columns).toEqual([
      expect.objectContaining({ key: "hd", labels: expect.objectContaining({ 10: "d10" }) }),
    ]);
    expect(dnd35.lists.items?.columns.map(({ key, unit }) => [key, unit])).toEqual([
      ["type", undefined],
      ["template", undefined],
      ["costGp", "gp"],
      ["weight", "lbs"],
    ]);
    // Feats and spells narrow by their pools, spells by their level too; feats group by family; items copy
    const kind = (type: string) => dnd35.kinds.find((each) => each.type === type);
    // Each by its aptitudes, at their query key and the URL's, those of its own scope
    const aptitudes = { key: "aptitudeId", param: "aptitude", type: "aptitudes" };
    expect(dnd35.kinds.filter((each) => each.pools).map(({ pools, type }) => [type, pools])).toEqual([
      ["feats", { ...aptitudes, scope: "feats" }],
      ["powers", { ...aptitudes, scope: "spells" }],
    ]);
    expect(dnd35.kinds.filter((each) => each.levels).map(({ type }) => type)).toEqual(["powers"]);
    expect(dnd35.kinds.filter((each) => each.families).map(({ type }) => type)).toEqual(["feats"]);
    expect(dnd35.kinds.filter((each) => each.wideForm).map(({ type, wideForm }) => [type, wideForm])).toEqual([
      ["powers", "fixed"],
      ["items", "fluid"],
    ]);
    // A class's page links it to its class skills
    expect(kind("klasses")?.links).toEqual({
      key: "skillId",
      owner: "klassId",
      target: "skillsInRule",
      type: "skills",
    });
    expect(kind("feats")?.lockedName).toEqual({ flag: "generated", reason: "A generated feat keeps its name" });
    // A pool's links column reads its links where an entity read holds them
    expect(dnd35.columns.feats?.find((column) => column.key === "aptitudeIds")).toMatchObject({
      links: "featsAptitudesInRules",
    });
    expect(dnd35.columns.powers?.find((column) => column.key === "aptitudes")).toMatchObject({
      links: "powersAptitudesInRules",
    });
    expect(kind("items")?.copies).toEqual({
      locked: ["slot", "sourceItemId", "type"],
      most: 50,
      source: "sourceItemId",
      template: "isTemplate",
    });
    // A pools column reads the links its list's rows hold, each its pool where the column says
    expect(dnd35.lists.feats?.columns.map(({ key, reads, target }) => [key, reads, target])).toEqual([
      ["featsAptitudesInRules", "pools", "aptitudesInRule"],
    ]);
    // Its classes' progression: a level's base attack bonus and skill points, a base per save, two spell tables
    expect(dnd35.progression.tracks.map(({ key, source }) => [key, source])).toEqual([
      ["bab", "field"],
      ["saves", "amounts"],
      ["skills", "field"],
    ]);
    expect(dnd35.progression.tracks[0].labels?.[6]).toBe("+6/+1");
    expect(dnd35.progression.tables.map(({ all, key, table, totals }) => [key, all, table, totals])).toEqual([
      ["perDay", undefined, "spells", "spellsPerDay"],
      ["known", "All", "spells-known", "spellsKnown"],
    ]);
    // What its levels grant past their columns: feat pools, their picks and totals where its answer and table hold them
    expect(dnd35.progression.grants).toMatchObject({
      picks: "featPicks",
      pools: { scope: "feats", type: "aptitudes" },
      table: "feat-pools",
      totals: "featPools",
    });
    // What they count: its spells, on a class's spell list, on its Spells and Spell List tabs
    expect(dnd35.progression.counts).toMatchObject({
      lists: "spell-lists",
      listTab: "spell-list",
      tab: "spells",
      type: "powers",
    });
    // Its level steps' words are their steps', which a level's steps carry: none in the rules
    expect(dnd35).not.toHaveProperty("levelUp");
  });
});
