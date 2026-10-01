import { describe, expect, test } from "bun:test";

import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import {
  formatActivityDetails,
  formatActivityType,
  formatNotificationMessage,
  formatRelativeTime,
} from "@/client/src/lib/activityFormatters.ts";
import { getRollFunction, isDiceMethod, POINT_BUY_COSTS, rollDie } from "@/client/src/lib/dice.ts";
import { accessLost, errorMessage, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { formatCost, formatCount, formatDecimal, formatSigned, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { extractTemplateExpression, extractTemplatePath, isTemplateValue } from "@/client/src/lib/templateValues.ts";
import { confirmPasswordRules, emailRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import { valuesEqual } from "@/client/src/lib/valuesEqual.ts";
import { ApiError } from "@/client/src/services/apiError.ts";

describe("Numbers shown to the user", () => {
  test("have two decimals, or none when there's no number", () => {
    expect([
      formatDecimal(5),
      formatDecimal("1.5"),
      formatDecimal(""),
      formatDecimal(null),
      formatDecimal("abc"),
    ]).toEqual(["5.00", "1.50", null, null, null]);
    expect([formatWeight("5"), formatWeight(undefined), formatCost(15), formatCost("")]).toEqual([
      "5.00 lbs",
      null,
      "15.00 gp",
      null,
    ]);
  });

  test("carry their sign when they're bonuses, and their noun when they're counts", () => {
    expect([formatSigned(2), formatSigned(-1), formatSigned(0), formatSigned(null)]).toEqual(["+2", "-1", "+0", "+0"]);
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
    expect(["a@b.co", "a@b", "a b@c.de", "@b.co"].map((email) => emailRules.pattern.value.test(email))).toEqual([
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

  test("take whole numbers only, an empty field left to `required`", () => {
    const { validate, min } = wholeNumberRules(1, "Required");
    expect([validate(3), validate(2.5), validate(Number.NaN)]).toEqual([true, "Whole numbers only", true]);
    expect(min).toEqual({ value: 1, message: "Minimum 1" });
  });
});

describe("Form values compared for changes", () => {
  test("treat an empty field, null and undefined as the same", () => {
    expect([
      valuesEqual("", undefined),
      valuesEqual(null, ""),
      valuesEqual({ a: "" }, {}),
      valuesEqual(undefined, { a: null }),
    ]).toEqual([true, true, true, true]);
  });

  test("compare arrays and objects in depth", () => {
    expect(valuesEqual({ a: [1, { b: "x" }] }, { a: [1, { b: "x" }] })).toBe(true);
    expect([
      valuesEqual([1, 2], [1, 2, 3]),
      valuesEqual({ a: { b: 1 } }, { a: { b: 2 } }),
      valuesEqual([1], { 0: 1 }),
      valuesEqual(0, ""),
    ]).toEqual([false, false, false, false]);
  });
});

describe("A template value", () => {
  test("is a non-empty {{ expression }}", () => {
    expect(["{{ abilities.strength.modifier }}", "{{x}}", "{{ }}", "3", "{{ a }} + 1"].map(isTemplateValue)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect([extractTemplateExpression("{{ a + 1 }}"), extractTemplateExpression("3")]).toEqual(["a + 1", null]);
  });

  test("names a path when it's a single one, bracketed or not", () => {
    expect(
      [
        "{{ abilities.charisma.modifier }}",
        "{{ [abilities.charisma.modifier] }}",
        "{{ a.b + 1 }}",
        "{{ max(a, b) }}",
        "a.b",
      ].map(extractTemplatePath),
    ).toEqual(["abilities.charisma.modifier", "abilities.charisma.modifier", null, null, null]);
  });
});

describe("An activity", () => {
  test("is labelled by its type, in its ruleset's words, with its entity", () => {
    expect(formatActivityType("createPower", { baseRules: "Dungeons & Dragons: 3.5", entityName: "Fireball" })).toBe(
      "Create Spell: Fireball",
    );
    expect(formatActivityType("createPower")).toBe("Create Power");
  });

  test("notifies with its actor, else someone, and a known type's sentence", () => {
    expect(formatNotificationMessage("createCampaignInvite", { actorName: "Ann", campaignName: "Tomb" })).toBe(
      "Ann invited you to Tomb",
    );
    expect(formatNotificationMessage("createFeat", { entityName: "Dodge" })).toBe("Someone created feat Dodge");
    expect(formatNotificationMessage("createFeat", {})).toBe("Someone created feat");
    expect(formatNotificationMessage("somethingNew", { actorName: "Ann" })).toBe("Ann: something new");
  });

  test("details the fields it changed, its level, modifier and property", () => {
    expect(
      formatActivityDetails({
        changedFields: [
          { field: "name", from: "A", to: "B" },
          { field: "hd", to: "8" },
          { field: "slot", from: "Neck" },
          { field: "size" },
          { bad: true },
        ],
        level: 3,
        target: "combat.ac.misc",
        operator: "add",
        value: "1",
        propertyType: "costGp",
      }),
    ).toBe("Name: A → B\nHit die set to 8\nSlot cleared\nSize updated\nLevel 3\nadd 1 on combat.ac.misc\nCost (gp): 1");
    expect([formatActivityDetails({}), formatActivityDetails("not a payload")]).toEqual([null, null]);
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

describe("Dice", () => {
  test("roll between one and their sides, and ability methods between 3 and 18", () => {
    for (let i = 0; i < 200; i++) {
      expect(rollDie(6)).toBeWithin(1, 7);
      expect(getRollFunction("4d6-drop-lowest")!()).toBeWithin(3, 19);
      expect(getRollFunction("3d6-straight")!()).toBeWithin(3, 19);
    }
    expect([getRollFunction("standard-array"), getRollFunction("point-buy")]).toEqual([null, null]);
    expect(
      ["4d6-drop-lowest", "3d6-straight", "standard-array", "point-buy"].map((method) =>
        isDiceMethod(method as Parameters<typeof isDiceMethod>[0]),
      ),
    ).toEqual([true, true, false, false]);
  });

  test("cost more points for each higher score", () => {
    const scores = Object.keys(POINT_BUY_COSTS)
      .map(Number)
      .sort((a, b) => a - b);
    for (const [i, score] of scores.slice(1).entries())
      expect(POINT_BUY_COSTS[score]).toBeGreaterThan(POINT_BUY_COSTS[scores[i]]);
  });
});

describe("Lists", () => {
  test("of an infinite query are its pages' items, in order", () => {
    expect(pageItems({ pages: [{ items: [1, 2] }, { items: [3] }] })).toEqual([1, 2, 3]);
    expect(pageItems(undefined)).toEqual([]);
  });

  test("of abilities follow their ruleset's order, unknown ones last", () => {
    const names = ["Wisdom", "Luck", "strength", "Charisma"];
    expect(sortAbilities(names, "Dungeons & Dragons: 3.5", (name) => name)).toEqual([
      "strength",
      "Wisdom",
      "Charisma",
      "Luck",
    ]);
    expect(sortAbilities(names, "Another game", (name) => name)).toBe(names);
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
