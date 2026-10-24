import { describe, expect, test } from "bun:test";

import { isValidElement, type ReactElement, type ReactNode } from "react";

import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import InfoPage from "@/engine/rulesets/dnd3.5/characters/sheet/InfoPage.tsx";
import type { RulesetAbility } from "@/engine/rulesets/dnd3.5/index.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLinks, Entities } from "@/server/repositories/index.ts";
import { buildAs, createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { carry } from "@/tests/support/items.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";

/** The first element of a page's tree, its components called, that `matches`. */
function findElement(
  node: ReactNode,
  matches: (element: ReactElement<{ children?: ReactNode; wrap?: boolean }>) => boolean,
): ReactNode {
  if (Array.isArray(node)) return node.map((child) => findElement(child, matches)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; wrap?: boolean }>(node)) return undefined;
  if (typeof node.type === "function")
    return findElement((node.type as (props: object) => ReactNode)(node.props), matches);
  return matches(node) ? node : findElement(node.props.children, matches);
}

/** The text a page's element tree shows, its components called, each piece in order. */
function textOf(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (typeof node.type === "function") return textOf((node.type as (props: object) => ReactNode)(node.props));
  return textOf(node.props.children);
}

describe("InfoPage", () => {
  test("prints its classes and their levels under its name, as the web sheet's header does, its ruleset beside them", async () => {
    const detailed = await buildAs(DetailedCharacter, await findSeededCharacter("Kael Stormborn"));

    const text = textOf(InfoPage({ detailedCharacter: detailed }));
    const at = text.indexOf("Kael Stormborn");
    // Its race is its Personal Details'
    expect(text.slice(at, at + 3)).toEqual(["Kael Stormborn", "Fighter 3 · Barbarian 1", "Core SRD 3.5"]);
  });

  test("prints every ability the character has a score in, the books' six first, then the others by name, with their name", async () => {
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const ability = async (name: string) =>
      (await Entities.create<RulesetAbility>(db, "abilities", { name, description: "", rulesetId: fork.id }))[0];
    const sanity = await ability("Sanity");
    const forcePoints = await ability("Force Points");
    RulesetViews.invalidate(fork.id);
    const character = await createTestCharacter(SEED_USER_ID, { rulesetId: fork.id });
    const { abilityMap } = await getSeedCtx();
    // Written out of order: the page orders them, not the rows
    const score = (abilityId: string, value: number) => ({ characterId: character.id, abilityId, score: value });
    await CharacterLinks.createMany(db, "abilities", [
      score(sanity.id, 9),
      score(forcePoints.id, 14),
      ...Object.values(abilityMap).map((abilityId) => score(abilityId, 12)),
    ]);

    const text = textOf(InfoPage({ detailedCharacter: await buildAs(DetailedCharacter, character) }));
    const at = text.indexOf("Ability Scores");
    // Each box: its abbreviation, its total, its modifier, and its base / levels / misc
    const books = text.slice(at + 1, at + 1 + 6 * 4);
    expect(books.filter((_, i) => i % 4 === 0)).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    // The others, their name under their abbreviation
    expect(text.slice(at + 1 + 6 * 4, at + 1 + 6 * 4 + 2 * 5)).toEqual([
      "FOR",
      "Force Points",
      "14",
      "+2",
      "14 / +0 / +0",
      "SAN",
      "Sanity",
      "9",
      "-1",
      "9 / +0 / +0",
    ]);
  });

  test("says a character with no ability score has none", async () => {
    const character = await createTestCharacter(SEED_USER_ID);
    const text = textOf(InfoPage({ detailedCharacter: await buildAs(DetailedCharacter, character) }));
    expect(text[text.indexOf("Ability Scores") + 1]).toBe("No ability scores");
  });

  test("shows a height and a weight as the player wrote them, free text without a unit added", async () => {
    const detailed = await buildAs(DetailedCharacter, await findSeededCharacter("Bjorn Ironhand"));
    const { physiology } = detailed.components.identity.getIdentity();
    physiology.height = `5'11"`;
    physiology.weight = "82 kg";

    const text = textOf(InfoPage({ detailedCharacter: detailed }));
    const after = (label: string) => text[text.indexOf(label) + 1];
    expect([after("Height:"), after("Weight:")]).toEqual([`5'11"`, "82 kg"]);
  });

  test("prints the combat the web sheet shows: its base attack bonus, speed and each weapon's attacks", async () => {
    const detailed = await buildAs(DetailedCharacter, await findSeededCharacter("Bjorn Ironhand"));
    const combat = CombatSheet.describe(detailed.components.combat);

    const text = textOf(InfoPage({ detailedCharacter: detailed }));
    const after = (label: string) => text[text.indexOf(label) + 1];
    expect([after("BAB"), after("Speed")]).toEqual([combat.babLabel, combat.speedLabel]);
    const rows = combat.weaponSets.flatMap(({ weapons }) => weapons.flatMap((weapon) => weapon.rows));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const at = text.indexOf(row.label);
      expect(text.slice(at + 1, at + 7)).toEqual([row.attack, row.damage, row.critical, "—", "—", row.types]);
    }
  });

  test("prints a ranged attack's range and increment in their columns, a melee one's empty", async () => {
    // Vex's dagger, melee and thrown, then his light crossbow
    const detailed = await buildAs(DetailedCharacter, await findSeededCharacter("Vex Flamecaller"));
    const text = textOf(InfoPage({ detailedCharacter: detailed }));
    const ranges = (label: string) => {
      const at = text.indexOf(label);
      return text.slice(at + 4, at + 6);
    };
    expect([ranges("Main Hand"), ranges("Main Hand, thrown"), ranges("Two Handed")]).toEqual([
      ["—", "—"],
      ["50 ft.", "-2 / 10 ft."],
      ["800 ft.", "-2 / 80 ft."],
    ]);
  });

  test("keeps the combat's heading and stats on the page of its first weapon set", async () => {
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    await carry(bjorn, [
      { item: "Longsword", location: "Main Hand", groups: [0] },
      { item: "Greatsword", location: "Two Handed", groups: [1] },
    ]);
    const page = InfoPage({ detailedCharacter: await buildAs(DetailedCharacter, bjorn) });
    // The block a page never breaks: the heading, the stats, then the first set's heading
    const kept = findElement(page, (node) => node.props.wrap === false && textOf(node).includes("Combat"));
    const text = textOf(kept);
    expect([text[0], text.includes("Grapple"), text.includes("SET 1"), text.includes("SET 2")]).toEqual([
      "Combat",
      true,
      true,
      false,
    ]);
  });

  test("prints each weapon set's heading, what it holds, and its AC, touch and flat-footed before its attacks", async () => {
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    await carry(bjorn, [
      { item: "Longsword", location: "Main Hand", groups: [0] },
      { item: "Heavy Steel Shield", location: "Off Hand", groups: [0] },
      { item: "Greatsword", location: "Two Handed", groups: [1] },
    ]);
    const text = textOf(InfoPage({ detailedCharacter: await buildAs(DetailedCharacter, bjorn) }));
    const set = (heading: string) => {
      const at = text.indexOf(heading);
      return text.slice(at, at + 9);
    };
    expect(set("SET 1")).toEqual([
      "SET 1",
      " · Longsword, Heavy Steel Shield",
      "AC",
      "14",
      "TOUCH",
      "12",
      "FLAT-FOOTED",
      "12",
      "Weapon",
    ]);
    expect(set("SET 2")).toEqual(["SET 2", " · Greatsword", "AC", "12", "TOUCH", "12", "FLAT-FOOTED", "10", "Weapon"]);
  });

  test("prints a character with no weapon set's one loadout without a heading, and no AC among its combat stats", async () => {
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    await carry(bjorn, []);
    const text = textOf(InfoPage({ detailedCharacter: await buildAs(DetailedCharacter, bjorn) }));
    expect(text.filter((piece) => piece.startsWith("SET "))).toEqual([]);
    expect(text.filter((piece) => piece === "AC")).toHaveLength(1);
    const after = (label: string) => text[text.indexOf(label) + 1];
    expect([after("AC"), after("TOUCH"), after("FLAT-FOOTED")]).toEqual(["12", "12", "10"]);
  });
});
