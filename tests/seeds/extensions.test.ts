import { describe, expect, test } from "bun:test";

import {
  DND35_COMPLETE_ADVENTURER_NAME,
  DND35_COMPLETE_ARCANE_NAME,
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_DMG_NAME,
} from "@/content/dnd3.5/names.ts";
import { db } from "@/server/database/index.ts";
import { EntitySnapshots, Rulesets } from "@/server/repositories/index.ts";

import { seededRows } from "./seededRows.ts";

describe("The seeded extensions", () => {
  test.each([
    [DND35_DMG_NAME, "Evasion (Shadowdancer)", "Shadowdancer", 2],
    [DND35_DMG_NAME, "Uncanny Dodge (Shadowdancer)", "Shadowdancer", 2],
    [DND35_DMG_NAME, "Hide in Plain Sight (Shadowdancer)", "Shadowdancer", 1],
    [DND35_DMG_NAME, "Uncanny Dodge (Assassin)", "Assassin", 2],
    [DND35_DMG_NAME, "Hide in Plain Sight (Assassin)", "Assassin", 8],
    [DND35_DMG_NAME, "Uncanny Dodge (Dwarven Defender)", "Dwarven Defender", 2],
    [DND35_DMG_NAME, "Damage Reduction (Dwarven Defender)", "Dwarven Defender", 6],
    [DND35_COMPLETE_DIVINE_NAME, "Damage Reduction (Favored Soul)", "Favored Soul", 20],
  ])("%s: %s is a class feature a %s gets at level %i", async (ruleset, name, klass, level) => {
    const rows = await seededRows(ruleset);
    const feat = rows.feat(name);
    expect(feat.featsAptitudesInRules.map((link) => link.aptitudeId)).toContain(
      rows.aptitude(`${klass} Class Feature`).id,
    );
    expect(
      rows.klassLevelFeats
        .filter((grant) => grant.klassLevelId === rows.klassLevel(klass, level).id)
        .map((grant) => grant.featId),
    ).toContain(feat.id);
  });

  test("copy core feats under their names, each copy recorded against its source", async () => {
    const warrior = await seededRows(DND35_COMPLETE_WARRIOR_NAME);
    const coreFeats = new Map((await seededRows()).feats.map((feat) => [feat.id, feat]));
    const snapshots = (
      await EntitySnapshots.findMany(db, { rulesetId: warrior.rulesetId, entityType: "feats" })
    ).filter((s) => coreFeats.has(s.sourceEntityId));
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      expect(warrior.feats.find((feat) => feat.id === snapshot.forkedEntityId)?.name).toBe(
        coreFeats.get(snapshot.sourceEntityId)!.name,
      );
    }
  });

  // Regression: a domain spell an extension copies from the core rules (Complete Divine's Magic Missile, for the
  // Force domain) lost the core spell's class spell lists, so forks using the extension lost it from Wizard Spells.
  test("keep the class spell lists of the core spells their domains copy", async () => {
    const core = await seededRows();
    const corePowers = new Map(core.powers.map((power) => [power.id, power]));
    const failures: string[] = [];
    let copies = 0;
    for (const extension of (await Rulesets.findMany(db, { system: true })).filter((r) => r.id !== core.rulesetId)) {
      const rows = await seededRows(extension.name);
      for (const { sourceEntityId, forkedEntityId } of await EntitySnapshots.findMany(db, {
        rulesetId: extension.id,
        entityType: "powers",
      })) {
        const source = corePowers.get(sourceEntityId);
        const copy = rows.powers.find((power) => power.id === forkedEntityId);
        if (!source || !copy) continue;
        const copyLists = new Set(copy.powersAptitudesInRules.map((link) => link.aptitudeId));
        // A copy with a list of its own was made for a domain.
        if (![...copyLists].some((id) => !source.powersAptitudesInRules.some((link) => link.aptitudeId === id)))
          continue;
        copies++;
        const lost = source.powersAptitudesInRules.filter(
          (link) => link.aptitudesInRule.name.endsWith("Spells") && !copyLists.has(link.aptitudeId),
        );
        if (lost.length > 0) {
          failures.push(
            `${extension.name}: ${copy.name} lost ${lost.map((link) => link.aptitudesInRule.name).join(", ")}`,
          );
        }
      }
    }
    expect(copies).toBeGreaterThan(0);
    expect(failures).toEqual([]);

    const divine = await seededRows(DND35_COMPLETE_DIVINE_NAME);
    const missile = divine.powers.find((power) => power.name === "Magic Missile")!;
    const snapshot = (await EntitySnapshots.findMany(db, { rulesetId: divine.rulesetId, entityType: "powers" })).find(
      (s) => s.forkedEntityId === missile.id,
    );
    expect(snapshot?.sourceEntityId).toBe(core.powers.find((power) => power.name === "Magic Missile")!.id);
    expect(missile.powersAptitudesInRules.map((link) => link.aptitudeId)).toContain(
      divine.aptitude("Force Domain Spells").id,
    );
  });

  test("give the prestige casters that draw on other classes' lists their spells, by their book's rules", async () => {
    /** The levels some spells are at on a seeded ruleset's list, by spell (none when it isn't on it). */
    const levelsOn = async (rulesetName: string, list: string, spells: string[]) => {
      const { powers } = await seededRows(rulesetName);
      return Object.fromEntries(
        spells.map((spell) => [
          spell,
          powers
            .find((power) => power.name === spell)
            ?.powersAptitudesInRules.find((link) => link.aptitudesInRule.name === list)?.level,
        ]),
      );
    };
    // The cleric's
    const core = await seededRows();
    const clericSpells = core.powers.flatMap((power) =>
      power.powersAptitudesInRules
        .filter((link) => link.aptitudesInRule.name === "Cleric Spells")
        .map((link) => [power.name, link.level] as const),
    );
    expect(clericSpells.length).toBeGreaterThan(200);
    expect(
      await levelsOn(
        DND35_COMPLETE_DIVINE_NAME,
        "Ur-priest Spells",
        clericSpells.map(([name]) => name),
      ),
    ).toEqual(Object.fromEntries(clericSpells));
    // The bard's and the sorcerer's, at the bard's level where they differ; a wizard's own isn't on it
    expect(
      await levelsOn(DND35_COMPLETE_ARCANE_NAME, "Sublime Chord Spells", [
        "Suggestion",
        "Charm Monster",
        "Cure Light Wounds",
        "Fireball",
        "Rary's Mnemonic Enhancer",
      ]),
    ).toEqual({
      Suggestion: 2,
      "Charm Monster": 3,
      "Cure Light Wounds": 1,
      Fireball: 3,
      "Rary's Mnemonic Enhancer": undefined,
    });
    // The sorcerer's of some schools: the spellthief's five, the Suel arcanamach's four
    const schools = ["Charm Person", "Dispel Magic", "Invisibility", "Haste", "Fireball", "Magic Missile"];
    expect(await levelsOn(DND35_COMPLETE_ADVENTURER_NAME, "Spellthief Spells", schools)).toEqual({
      "Charm Person": 1,
      "Dispel Magic": 3,
      Invisibility: 2,
      Haste: 3,
      Fireball: undefined,
      "Magic Missile": undefined,
    });
    expect(await levelsOn(DND35_COMPLETE_ARCANE_NAME, "Suel Arcanamach Spells", schools)).toEqual({
      "Charm Person": undefined,
      "Dispel Magic": 3,
      Invisibility: 2,
      Haste: 3,
      Fireball: undefined,
      "Magic Missile": undefined,
    });
    // The ranger's and the paladin's, with their additions; the holy liberator's without the lawful spells
    expect(
      await levelsOn(DND35_COMPLETE_DIVINE_NAME, "Consecrated Harrier Spells", [
        "Entangle",
        "Animate Rope",
        "Hold Person",
        "Mark of Justice",
      ]),
    ).toEqual({ Entangle: 1, "Animate Rope": 1, "Hold Person": 2, "Mark of Justice": 4 });
    expect(
      await levelsOn(DND35_COMPLETE_DIVINE_NAME, "Holy Liberator Spells", [
        "Bless",
        "Protection from Chaos",
        "Dispel Chaos",
        "Protection from Law",
        "Heroism",
        "Magic Circle Against Law",
        "Dispel Law",
      ]),
    ).toEqual({
      Bless: 1,
      "Protection from Chaos": undefined,
      "Dispel Chaos": undefined,
      "Protection from Law": 1,
      Heroism: 2,
      "Magic Circle Against Law": 3,
      "Dispel Law": 4,
    });
    // The pious templar's two: the paladin's, lawful spells included, and the blackguard's
    expect(
      await levelsOn(DND35_COMPLETE_DIVINE_NAME, "Pious Templar Spells", [
        "Bless Weapon",
        "Protection from Chaos",
        "Cause Fear",
      ]),
    ).toEqual({ "Bless Weapon": 1, "Protection from Chaos": 1, "Cause Fear": undefined });
    expect(
      await levelsOn(DND35_COMPLETE_DIVINE_NAME, "Pious Templar Blackguard Spells", [
        "Cause Fear",
        "Contagion",
        "Bless Weapon",
      ]),
    ).toEqual({ "Cause Fear": 1, Contagion: 3, "Bless Weapon": undefined });
  });
  test("put a book's spells on its own copy of another book's list that draws on others', by that list's rule", async () => {
    // Complete Adventurer's Fly, Swift (bard 2, sorcerer/wizard 2, druid 3; transmutation): the sublime chord's list
    // (Complete Arcane: the bard's, then the sorcerer's), the Suel arcanamach's (the sorcerer's transmutation) and the
    // spirit shaman's (Complete Divine: the druid's), each the book's own copy, which a ruleset merges with its book's
    const adventurer = await seededRows(DND35_COMPLETE_ADVENTURER_NAME);
    const lists = ["Sublime Chord Spells", "Suel Arcanamach Spells", "Spirit Shaman Spells"];
    const fly = adventurer.powers.find((power) => power.name === "Fly, Swift")!;
    const links = fly.powersAptitudesInRules.filter((link) => lists.includes(link.aptitudesInRule.name));
    expect(Object.fromEntries(links.map((link) => [link.aptitudesInRule.name, link.level]))).toEqual({
      "Sublime Chord Spells": 2,
      "Suel Arcanamach Spells": 2,
      "Spirit Shaman Spells": 3,
    });
    expect(links.map((link) => link.aptitudeId).sort()).toEqual(
      lists.map((list) => adventurer.aptitude(list).id).sort(),
    );
  });

  test("give the divine crusader a pick of the core rules' and Complete Divine's domains, each joining its list to hers", async () => {
    const core = await seededRows();
    const divine = await seededRows(DND35_COMPLETE_DIVINE_NAME);
    // The cleric's domains of both, each with the list its feat joins
    const clericDomain = core.aptitude("Cleric Domain").id;
    const domains = [core, divine].flatMap((rows) =>
      rows.feats
        .filter((feat) => feat.featsAptitudesInRules.some((link) => link.aptitudeId === clericDomain))
        .map((feat) => [
          `${feat.name} (Divine Crusader)`,
          rows.modifiersOf(feat.id).find((modifier) => modifier.target.endsWith(".joinsclasslist"))?.target,
        ]),
    );
    expect(domains.length).toBeGreaterThan(20);

    const pool = divine.aptitude("Divine Crusader Domain").id;
    const choices = divine.feats.filter((feat) => feat.featsAptitudesInRules.some((link) => link.aptitudeId === pool));
    expect(
      Object.fromEntries(
        choices.map((feat) => [
          feat.name,
          divine.modifiersOf(feat.id).map((modifier) => `${modifier.target} ${modifier.value}`),
        ]),
      ),
    ).toEqual(Object.fromEntries(domains.map(([name, join]) => [name, [`${join} true`]])));
    expect(choices.every((feat) => feat.selectable && divine.requirementsOf(feat.id).length === 0)).toBe(true);
    // Picked at her first level
    expect(
      divine.modifiersOf(divine.klassLevel("Divine Crusader", 1).id).map((m) => `${m.target} ${m.operator} ${m.value}`),
    ).toContain("aptitudes.divinecrusaderdomain.allowed add 1");
  });
});
