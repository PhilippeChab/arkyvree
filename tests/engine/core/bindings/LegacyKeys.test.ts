import { describe, expect, test } from "bun:test";

import { LegacyKeys } from "@/engine/core/bindings/index.ts";
import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import type { NameBinding } from "@/shared/relations.ts";
import { composeView, rawRows } from "@/tests/support/composedViews.ts";

/**
 * A made-up module's paths: `perks.<owner>.<leaf>` names an owner, `lists.<list>.<owner>` a list (a target, by its name
 * without " Lore") and an owner, `perks.budget` none.
 */
const PATHS: Pick<TargetPaths, "nameSegments"> = {
  nameSegments(path: string) {
    const [category, second] = path.split(".");
    if (category === "lists") {
      return [
        {
          entityType: "targets",
          segment: 1,
          slugOf: (name, keyOf = (text) => text) => keyOf(name.replace(/ Lore$/, "")),
        },
        { entityType: "owners", segment: 2 },
      ];
    }
    return category === "perks" && second !== "budget" ? [{ entityType: "owners", segment: 1 }] : [];
  },
};

/** The made-up ruleset's view: owners and targets of these names. */
const VIEW = composeView([
  rawRows({
    owners: [
      "Discrétion",
      "Représentation (Chant)",
      "Arme de prédilection (Épée)",
      "Prédiction",
      "Prèdiction",
      "Climb",
      "Pêcheur",
      "Élan",
      "Lan",
    ].map((name, index) => ({ id: `o${index}`, name, rulesetId: "base" })),
    targets: [{ id: "t0", name: "Bardé Lore", rulesetId: "base" }],
  }),
]);

/** A binding of a row's place to an owner (`entity`) under the name it had, or to a group of that name. */
function bindingOf(
  rowId: string,
  place: { field?: "target" | "value"; path?: number; segment?: number },
  meaning: { entityId?: string; kind?: "entity" | "group"; name: string },
): NameBinding {
  return {
    entityId: meaning.entityId ?? null,
    entityType: "owners",
    field: place.field ?? "target",
    id: `${rowId}-${place.field ?? "target"}-${place.path ?? 0}-${place.segment ?? 1}`,
    kind: meaning.kind ?? "entity",
    modifierId: rowId,
    name: meaning.name,
    path: place.path ?? 0,
    requirementId: null,
    rulesetId: "base",
    segment: place.segment ?? 1,
  };
}

/** The made-up ruleset's rows, as stored, under its paths. */
function planOf(rows: { id: string; target: string | null; value: string | null }[], bindings: NameBinding[] = []) {
  return new LegacyKeys(VIEW, PATHS).plan(rows, bindings);
}

describe("A rule's text saved before keys kept accented letters", () => {
  test("bound to what it names: moves to the key of the name it was bound under, in its target and its formula", () => {
    const row = {
      id: "m1",
      target: "perks.discrtion.misc",
      value: "{{ floor([perks.discrtion.rank] / 2) + perks.climb.rank }}",
    };
    const bindings = [
      bindingOf("m1", {}, { entityId: "o0", name: "Discrétion" }),
      bindingOf("m1", { field: "value" }, { entityId: "o0", name: "Discrétion" }),
      bindingOf("m1", { field: "value", path: 1 }, { entityId: "o5", name: "Climb" }),
    ];

    const plan = planOf([row], bindings);

    expect(plan.rows.get("m1")).toEqual({
      target: "perks.discrétion.misc",
      value: "{{ floor([perks.discrétion.rank] / 2) + perks.climb.rank }}",
    });
    expect(plan.groups.size).toBe(0);
    expect(plan.unsettled).toEqual([]);
  });

  test("bound under a name written apart: its old key kept the bare letter, and moves the same", () => {
    const row = { id: "m1", target: "perks.discretion.misc", value: "2" };
    const plan = planOf([row], [bindingOf("m1", {}, { entityId: "o0", name: "Discrétion" })]);
    expect(plan.rows.get("m1")?.target).toBe("perks.discrétion.misc");
  });

  test("already under the new keys, or never accented: stays as it is, so a second run changes nothing", () => {
    const rows = [
      { id: "m1", target: "perks.discrétion.misc", value: "2" },
      { id: "m2", target: "perks.climb.misc", value: "{{ perks.budget }}" },
    ];
    const bindings = [
      bindingOf("m1", {}, { entityId: "o0", name: "Discrétion" }),
      bindingOf("m2", {}, { entityId: "o5", name: "Climb" }),
    ];
    expect(planOf(rows, bindings).rows.size).toBe(0);
  });

  test("unbound: takes the key of the one name whose old key it holds, a list's short name and a family's too", () => {
    const rows = [
      { id: "m1", target: "perks.discrtion.misc", value: "2" },
      { id: "m2", target: "lists.bard.discrtion", value: "true" },
      { id: "m3", target: "perks.reprsentation.rank", value: "1" },
    ];

    const plan = planOf(rows);

    expect([...plan.rows.values()].map(({ target }) => target)).toEqual([
      "perks.discrétion.misc",
      "lists.bardé.discrétion",
      "perks.représentation.rank",
    ]);
  });

  test("a group's binding takes its text's new key, so a fill doesn't judge it stale", () => {
    const row = { id: "m1", target: "perks.reprsentation.rank", value: "1" };
    const plan = planOf([row], [bindingOf("m1", {}, { kind: "group", name: "reprsentation" })]);
    expect(plan.rows.get("m1")?.target).toBe("perks.représentation.rank");
    expect([...plan.groups]).toEqual([["m1-target-0-1", "représentation"]]);
  });

  test("a wildcard's prefix moves to the new key of the same start of the names it matched", () => {
    const rows = [
      { id: "m1", target: "perks.armedeprdilection*.misc", value: "1" },
      { id: "m2", target: "perks.armede*.misc", value: "1" },
    ];
    const plan = planOf(rows);
    expect(plan.rows.get("m1")?.target).toBe("perks.armedeprédilection*.misc");
    expect(plan.rows.has("m2")).toBe(false);
    // One that started names whose starts now differ: left, and listed
    expect(planOf([{ id: "m3", target: "perks.prd*.misc", value: "1" }]).unsettled).toEqual([
      { field: "target", held: "prd*", keys: ["préd*", "prèd*"], rowId: "m3" },
    ]);
  });

  test("an old key two names had is left as it is, and listed with the keys it could be", () => {
    const plan = planOf([{ id: "m1", target: "perks.prdiction.misc", value: "1" }]);
    expect(plan.rows.size).toBe(0);
    expect(plan.unsettled).toEqual([
      { field: "target", held: "prdiction", keys: ["prédiction", "prèdiction"], rowId: "m1" },
    ]);
  });

  test("written under the new keys already: stays as it is, though its letters read past their accents name another", () => {
    const rows = [
      { id: "m1", target: "perks.pré*.misc", value: "1" },
      { id: "m2", target: "perks.pécheur.misc", value: "1" },
    ];
    const plan = planOf(rows, [bindingOf("m2", {}, { kind: "group", name: "pécheur" })]);
    expect(plan).toEqual({ groups: new Map(), rows: new Map(), unsettled: [] });
  });

  test("an old key that names an entity now, and was another name's old key: left, and listed with both", () => {
    const plan = planOf([{ id: "m1", target: "perks.lan.misc", value: "1" }]);
    expect(plan.rows.size).toBe(0);
    expect(plan.unsettled).toEqual([{ field: "target", held: "lan", keys: ["lan", "élan"], rowId: "m1" }]);
  });

  test("a text that names nothing under either key, or a word the paths use themselves, stays as it is", () => {
    const rows = [
      { id: "m1", target: "perks.unknown.misc", value: "1" },
      { id: "m2", target: "perks.budget", value: "1" },
    ];
    expect(planOf(rows)).toEqual({ groups: new Map(), rows: new Map(), unsettled: [] });
  });
});
