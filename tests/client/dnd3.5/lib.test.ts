import { describe, expect, test } from "bun:test";

import { partialMatchKey } from "@tanstack/react-query";

import {
  formatActivityDetails,
  formatActivityType,
  formatNotificationMessage,
} from "@/client/src/lib/activityFormatters.ts";
import { accessLost, errorMessage, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import {
  formatAmount,
  formatCount,
  formatDecimal,
  formatDie,
  formatTrimmed,
  formatTrimmedAmount,
} from "@/client/src/lib/formatNumeric.ts";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  confirmPasswordRules,
  EMAIL_RULES,
  NEW_PASSWORD_RULES,
  USERNAME_RULES,
  wholeNumberRules,
} from "@/client/src/lib/validation.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";
import { Engine } from "@/engine/index.ts";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth.ts";
import {
  CLASS_HD,
  ITEM_COST_GP,
  ITEM_SLOT,
  ITEM_TYPE,
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** Every base rules' words, kinds and license, as the engine describes them to the client. */
const RULES = Engine.rules().describeAll();
const DND35_WORDS = RULES["Dungeons & Dragons: 3.5"].words;

/** Gold pieces, as 3.5 describes its costs' unit */
const GOLD = { one: "gp", many: "gp" };

/** Pounds, as 3.5 describes its weights' unit */
const POUNDS = { one: "lb", many: "lbs" };

describe("Numbers shown to the user", () => {
  test("have two decimals, or none when there's no number", () => {
    expect([
      formatDecimal(5),
      formatDecimal("1.5"),
      formatDecimal(""),
      formatDecimal(null),
      formatDecimal("abc"),
    ]).toEqual(["5.00", "1.50", null, null, null]);
    expect([
      formatAmount("5", POUNDS),
      formatAmount(undefined, POUNDS),
      formatAmount(15, GOLD),
      formatAmount("", GOLD),
    ]).toEqual(["5.00 lbs", null, "15.00 gp", null]);
  });

  test("drop the zeros their decimals end with, where a phone shows them shorter", () => {
    expect([
      formatTrimmed(5),
      formatTrimmed("1.50"),
      formatTrimmed("0.25"),
      formatTrimmed(""),
      formatTrimmed(null),
    ]).toEqual(["5", "1.5", "0.25", null, null]);
  });

  test("take their unit's word, its singular after a single one alone", () => {
    expect(["1", "2", "0.5", "1.50", null].map((value) => formatTrimmedAmount(value, POUNDS))).toEqual([
      "1 lb",
      "2 lbs",
      "0.5 lbs",
      "1.5 lbs",
      null,
    ]);
    expect(formatTrimmedAmount(1, GOLD)).toBe("1 gp");
    // A decimal's text, as an item's weight reads, and none at all
    expect([formatTrimmedAmount("1.00", POUNDS), formatTrimmedAmount(0, POUNDS), formatAmount(0, POUNDS)]).toEqual([
      "1 lb",
      "0 lbs",
      "0.00 lbs",
    ]);
  });

  test("write a die in dice notation, as the books write a hit die", () => {
    expect([4, 8, 12].map(formatDie)).toEqual(["d4", "d8", "d12"]);
  });

  test("carry their noun when they're counts", () => {
    expect([formatCount(1, "player"), formatCount(3, "player"), formatCount(0, "player")]).toEqual([
      "1 player",
      "3 players",
      "0 players",
    ]);
  });
});

describe("An error's message", () => {
  test("is its own, else the fallback", () => {
    expect(errorMessage(new Error("Name taken"), "Failed")).toBe("Name taken");
    expect(errorMessage("Offline", "Failed")).toBe("Offline");
    expect([
      errorMessage("", "Failed"),
      errorMessage(new Error(""), "Failed"),
      errorMessage({ message: "no" }, "Failed"),
    ]).toEqual(["Failed", "Failed", "Failed"]);
  });

  test("says why a page didn't load: gone, no access, or failed", () => {
    const status = (code: number) => new ApiError("", code, "Error");
    expect([
      loadFailureMessage("Class", status(404)),
      loadFailureMessage("Class", status(403)),
      loadFailureMessage("Class", status(500)),
      loadFailureMessage("Class", new Error()),
    ]).toEqual([
      "Class not found",
      "You don't have access to this class",
      "Failed to load class",
      "Failed to load class",
    ]);
    expect([
      accessLost(status(404)),
      accessLost(status(403)),
      accessLost(status(500)),
      accessLost(new Error()),
    ]).toEqual([true, true, false, false]);
  });
});

describe("A URL parameter of a fixed set", () => {
  test("is kept when it's one of the set, else the fallback", () => {
    const sorts = ["name", "createdAt"] as const;
    expect([
      oneOf("name", sorts),
      oneOf("drop table", sorts),
      oneOf(null, sorts),
      oneOf("drop table", sorts, "createdAt"),
    ]).toEqual(["name", undefined, undefined, "createdAt"]);
  });
});

describe("Form rules", () => {
  test("check an email address's shape", () => {
    expect(["a@b.co", "a@b", "a b@c.de", "@b.co"].map((email) => EMAIL_RULES.pattern.value.test(email))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  test("check a confirmation against the password it repeats", () => {
    const { validate } = confirmPasswordRules<{ password: string }>("password");
    expect(validate("secret123", { password: "secret123" })).toBe(true);
    expect(validate("secret124", { password: "secret123" })).toBe("Passwords do not match");
  });

  test("measure a password and a username as the server stores them, trimmed", () => {
    const password = "x".repeat(PASSWORD_MIN_LENGTH);
    expect([NEW_PASSWORD_RULES.validate(password), NEW_PASSWORD_RULES.validate(` ${password.slice(1)} `)]).toEqual([
      true,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    ]);
    expect(["", "elara", "  ab  ", "   ", "x".repeat(51)].map((name) => USERNAME_RULES.validate(name))).toEqual([
      true,
      true,
      "Username must be at least 3 characters",
      "Username must be at least 3 characters",
      "Username must be at most 50 characters",
    ]);
  });

  test("take whole numbers only, an empty field left to `required`", () => {
    const { validate, min } = wholeNumberRules(1, "Required");
    expect([validate(3), validate(2.5), validate(Number.NaN)]).toEqual([true, "Whole numbers only", true]);
    expect(min).toEqual({ value: 1, message: "Minimum 1" });
  });

  test("check a whole number by its field's own checks, the first that fails saying why", () => {
    const { validate } = wholeNumberRules(1, "Required", 20, [
      (level) => level !== 3 || "Level 3 is listed twice",
      (level) => level % 2 === 1 || "Odd levels only",
    ]);
    expect([validate(5), validate(3), validate(4), validate(2.5), validate(Number.NaN)]).toEqual([
      true,
      "Level 3 is listed twice",
      "Odd levels only",
      "Whole numbers only",
      true,
    ]);
  });
});

describe("An entity type", () => {
  test("is named in its ruleset's words, singular or plural, the engine's own types' included", () => {
    expect(entityTypeLabel("spells", DND35_WORDS)).toBe("Spell");
    expect(entityTypeLabel("spells", DND35_WORDS, true)).toBe("Spells");
    expect(entityTypeLabel("classes", DND35_WORDS, true)).toBe("Classes");
    expect(entityTypeLabel("class_levels", DND35_WORDS)).toBe("Class Level");
    expect(entityTypeLabel("modifiers", DND35_WORDS, true)).toBe("Modifiers");
    // Before the rules load, or for a type with no word, a generic word: never its type as the code names it
    expect(entityTypeLabel("class_levels", undefined)).toBe("Entity");
    expect(entityTypeLabel("widgets", DND35_WORDS, true)).toBe("Entities");
  });
});

describe("An activity", () => {
  test("is labelled by its type, in its ruleset's words, with its entity", () => {
    expect(
      formatActivityType("createSpell", { baseRules: "Dungeons & Dragons: 3.5", entityName: "Fireball" }, RULES),
    ).toBe("Create Spell: Fireball");
    // The app's words, never the engine's names, an older activity's (its data names no base rules) by every rules'
    expect([
      formatActivityType("createClass", { entityName: "Fighter" }, RULES),
      formatActivityType("updateClassLevel", {}, RULES),
      formatActivityType("addClassSkill", {}, RULES),
    ]).toEqual(["Create Class: Fighter", "Update Class Level", "Add Class Skill"]);
  });

  test("notifies with its actor, else someone, and a known type's sentence", () => {
    expect(formatNotificationMessage("createCampaignInvite", { actorName: "Ann", campaignName: "Tomb" })).toBe(
      "Ann invited you to Tomb",
    );
    expect(formatNotificationMessage("createFeat", { entityName: "Dodge" }, RULES)).toBe("Someone created feat Dodge");
    expect(formatNotificationMessage("createFeat", {}, RULES)).toBe("Someone created feat");
    expect(formatNotificationMessage("somethingNew", { actorName: "Ann" })).toBe("Ann: something new");
    // A revoked contributor's names its ruleset; an older one's data has no name, and keeps the old words
    expect(formatNotificationMessage("revokeContributor", { actorName: "Ann", rulesetName: "Homebrew" })).toBe(
      "Ann revoked your access to Homebrew",
    );
    expect(formatNotificationMessage("revokeContributor", { actorName: "Ann" })).toBe(
      "Ann revoked your contributor access",
    );
    // An entity is named in its ruleset's word, an older activity's in every rules'
    expect([
      formatNotificationMessage("deleteSpell", { baseRules: "Dungeons & Dragons: 3.5", entityName: "Fireball" }, RULES),
      formatNotificationMessage("createClass", { actorName: "Ann", entityName: "Fighter" }, RULES),
      // An older activity's (its data names no base rules), in every rules' words
      formatNotificationMessage("updateSpell", { entityName: "Blast" }, RULES),
    ]).toEqual(["Someone deleted spell Fireball", "Ann created class Fighter", "Someone updated spell Blast"]);
    // What an entity holds, in its rules' terms: its levels, its progression, its links, an older one's by every rules'
    const dnd35 = { baseRules: "Dungeons & Dragons: 3.5", actorName: "Ann", entityName: "Fighter" };
    expect([
      formatNotificationMessage("createClassLevel", dnd35, RULES),
      formatNotificationMessage("updateClassLevel", { actorName: "Ann" }, RULES),
      formatNotificationMessage("deleteClassLevel", dnd35, RULES),
      formatNotificationMessage("updateClassProgression", dnd35, RULES),
      formatNotificationMessage("addClassSkill", { ...dnd35, skillName: "Climb" }, RULES),
      formatNotificationMessage("removeClassSkill", { actorName: "Ann" }, RULES),
    ]).toEqual([
      "Ann added a level to Fighter",
      "Ann updated a level of a class",
      "Ann removed a level from Fighter",
      "Ann updated the progression of Fighter",
      "Ann added Climb to Fighter",
      "Ann removed a skill from a class",
    ]);
    // A field's change, an older activity's: its entity's name, else an entity
    expect([
      formatNotificationMessage("createField", { actorName: "Ann", entityName: "Fireball" }),
      formatNotificationMessage("updateField", { actorName: "Ann" }),
      formatNotificationMessage("deleteField", { entityName: "Fireball" }),
    ]).toEqual([
      "Ann added a field to Fireball",
      "Ann updated a field on an entity",
      "Someone removed a field from Fireball",
    ]);
  });

  test("details the fields it changed, its level, modifier and a field's value", () => {
    expect(
      formatActivityDetails(
        "updateItem",
        {
          baseRules: "Dungeons & Dragons: 3.5",
          changedFields: [
            { field: "name", from: "A", to: "B" },
            { field: ITEM_COST_GP, from: "15", to: "20" },
            { field: ITEM_SLOT, from: "Neck" },
            { field: RACE_BASE_SPEED },
            { field: "madeFrom", to: "00000000-0000-0000-0000-000000000000" },
            { bad: true },
          ],
          level: 3,
        },
        RULES,
      ),
    ).toBe("Name: A → B\nCost: 15.00 gp → 20.00 gp\nSlot cleared\nRace Base Speed updated\nTemplate updated\nLevel 3");
    // A field reads as its own entity's column, by the stored field or the role that keeps it, never another's: a
    // class's hit die, a language's type, a skill's ability by its link's role, which says only that it changed
    const baseRules = "Dungeons & Dragons: 3.5";
    expect(
      formatActivityDetails("updateClass", { baseRules, changedFields: [{ field: CLASS_HD, to: "8" }] }, RULES),
    ).toBe("Hit Die set to d8");
    expect(
      formatActivityDetails(
        "updateLanguage",
        { baseRules, changedFields: [{ field: LANGUAGE_TYPE, from: "Common", to: "Exotic" }] },
        RULES,
      ),
    ).toBe("Type: Common → Exotic");
    const ability = {
      field: "keyAbility",
      from: "7c0d4b52-0c0e-4b8e-9d7f-1f2a3b4c5d6e",
      to: "00000000-0000-0000-0000-000000000000",
    };
    expect(formatActivityDetails("updateSkill", { baseRules, changedFields: [ability] }, RULES)).toBe(
      "Primary Ability updated",
    );
    expect([
      formatActivityDetails("createModifier", { target: "combat.ac.misc", operator: "add", value: "1" }),
      formatActivityDetails("updateRequirement", { target: "identity.name", operator: "not_empty" }),
      formatActivityDetails("createField", { field: "SPELL_SCHOOL", value: "Evocation" }),
    ]).toEqual(["+ 1 on combat.ac.misc", "is not empty on identity.name", "Spell School: Evocation"]);
    expect([formatActivityDetails("updateItem", {}), formatActivityDetails("updateItem", "not a payload")]).toEqual([
      null,
      null,
    ]);
  });

  test("details an older activity's changes, which names no base rules, by every base rules' columns", () => {
    // As 0090 rewrote what an item's, a race's and a spell's update recorded before its activity named its base rules
    const changedFields = [
      { field: "madeFrom", from: "7c0d4b52-0c0e-4b8e-9d7f-1f2a3b4c5d6e", to: "00000000-0000-0000-0000-000000000000" },
      { field: ITEM_TYPE, from: "Weapon", to: "Armor" },
    ];
    const read = "Template updated\nItem Type: Weapon → Armor";
    expect(formatActivityDetails("updateItem", { entityName: "Blade", changedFields }, RULES)).toBe(read);
    expect(
      formatActivityDetails(
        "updateItem",
        { baseRules: "Dungeons & Dragons: 3.5", entityName: "Blade", changedFields },
        RULES,
      ),
    ).toBe(read);
    const speed = { changedFields: [{ field: RACE_BASE_SPEED, from: "30", to: "20" }] };
    expect(formatActivityDetails("updateRace", speed, RULES)).toBe("Base Speed: 30 → 20");
    const save = { changedFields: [{ field: "resistedBy", to: "00000000-0000-0000-0000-000000000000" }] };
    expect(formatActivityDetails("updateSpell", save, RULES)).toBe("Saving Throw updated");
  });

  test("happened a while ago, in the unit that reads best", () => {
    const ago = (ms: number) => formatRelativeTime(new Date(Date.now() - ms).toISOString());
    expect([ago(10_000), ago(5 * 60_000), ago(3 * 3_600_000), ago(2 * 86_400_000)]).toEqual([
      "just now",
      "5m ago",
      "3h ago",
      "2d ago",
    ]);
    expect(ago(40 * 86_400_000)).not.toMatch(/ago$/);
  });
});

describe("Query keys", () => {
  // An item's write refreshes its ruleset's Items section, and with it what a character's add dialog read of the items
  test("of a ruleset's items, as a character's add dialog reads them, nest under its Items section", () => {
    const section = QUERY_KEYS.rulesets.section("r", "items");
    expect([
      partialMatchKey(QUERY_KEYS.rulesets.item("r", "items", "i"), section),
      partialMatchKey(QUERY_KEYS.rulesets.sectionSearch("r", "items", "sword"), section),
    ]).toEqual([true, true]);
  });
});

describe("Lists", () => {
  test("of an infinite query are its pages' items, in order", () => {
    expect(pageItems({ pages: [{ items: [1, 2] }, { items: [3] }] })).toEqual([1, 2, 3]);
    expect(pageItems(undefined)).toEqual([]);
  });

  test("in a listbox fetch the next page of each list that has one, near the bottom", () => {
    const list = (hasNextPage: boolean, isFetchingNextPage = false) => {
      const fetched: number[] = [];
      return { hasNextPage, isFetchingNextPage, fetchNextPage: () => fetched.push(1), fetched };
    };
    const scroll = (lists: ReturnType<typeof list>[], scrollTop: number) =>
      createListboxScrollHandler(lists)({
        currentTarget: { scrollHeight: 1000, scrollTop, clientHeight: 200 },
      } as unknown as Parameters<ReturnType<typeof createListboxScrollHandler>>[0]);
    const [more, done, busy] = [list(true), list(false), list(true, true)];
    scroll([more, done, busy], 100);
    expect(more.fetched).toEqual([]);
    scroll([more, done, busy], 760);
    expect([more.fetched, done.fetched, busy.fetched]).toEqual([[1], [], []]);
  });
});
