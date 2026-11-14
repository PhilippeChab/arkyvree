import { describe, expect, test } from "bun:test";

import { LegacyKeys } from "@/engine/core/bindings/index.ts";
import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import type { NameBinding } from "@/shared/relations.ts";
import { composeView, rawRows } from "@/tests/support/composedViews.ts";

/** The made-up ruleset's owners: no two of one key. */
const NAMES = [
  "Discrétion",
  "Représentation (Chant)",
  "Arme de prédilection (Épée)",
  "Prédiction",
  "Prádiction",
  "Climb",
  "Pêcheur",
  "Élan",
  "Lan",
];

/**
 * A made-up module's paths: `perks.<owner>.<leaf>` names an owner, `lists.<list>.<owner>` a list (a target, by its name
 * without " Lore") and an owner, `perks.budget` none.
 */
const PATHS: Pick<TargetPaths, "namedKinds" | "nameSegments"> = {
  namedKinds: () => ["owners", "targets"],
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

/** The made-up ruleset's rows, as stored, under its paths, in a view of its owners (`names`). */
function planOf(
  rows: { id: string; target: string | null; value: string | null }[],
  bindings: NameBinding[] = [],
  names = NAMES,
) {
  return new LegacyKeys(viewOf(names), PATHS).plan(rows, bindings);
}

/** Owners of these names, in a made-up ruleset's view, beside a target. */
function viewOf(names: string[]) {
  return composeView([
    rawRows({
      owners: names.map((name, index) => ({ id: `o${index}`, name, rulesetId: "base" })),
      targets: [{ id: "t0", name: "Bardé Lore", rulesetId: "base" }],
    }),
  ]);
}

describe("A rule's text saved while keys left accented letters out", () => {
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
      target: "perks.discretion.misc",
      value: "{{ floor([perks.discretion.rank] / 2) + perks.climb.rank }}",
    });
    expect(plan.groups.size).toBe(0);
    expect(plan.unsettled).toEqual([]);
  });

  test("bound under a name written apart: its old key kept the bare letter, which is its new key already", () => {
    const row = { id: "m1", target: "perks.discretion.misc", value: "2" };
    expect(planOf([row], [bindingOf("m1", {}, { entityId: "o0", name: "Discrétion" })]).rows.size).toBe(0);
  });

  test("already under the new keys, or never accented: stays as it is, so a second run changes nothing", () => {
    const rows = [
      { id: "m1", target: "perks.discretion.misc", value: "2" },
      { id: "m2", target: "perks.climb.misc", value: "{{ perks.budget }}" },
      { id: "m3", target: "perks.elan.misc", value: "{{ perks.representation.rank }}" },
      { id: "m4", target: "lists.barde.armedepredilection*", value: "true" },
    ];
    const bindings = [
      bindingOf("m1", {}, { entityId: "o0", name: "Discrétion" }),
      bindingOf("m2", {}, { entityId: "o5", name: "Climb" }),
    ];
    expect(planOf(rows, bindings)).toEqual({ clashes: [], groups: new Map(), rows: new Map(), unsettled: [] });
    expect(planOf(rows)).toEqual({ clashes: [], groups: new Map(), rows: new Map(), unsettled: [] });
  });

  test("unbound: takes the key of the one name whose old key it holds, a list's short name and a family's too", () => {
    const rows = [
      { id: "m1", target: "perks.discrtion.misc", value: "2" },
      { id: "m2", target: "lists.bard.discrtion", value: "true" },
      { id: "m3", target: "perks.reprsentation.rank", value: "1" },
      { id: "m4", target: "perks.lan.misc", value: "{{ perks.discrtion.rank }}" },
    ];

    const plan = planOf(rows);

    expect([...plan.rows.values()]).toEqual([
      { target: "perks.discretion.misc", value: "2" },
      { target: "lists.barde.discretion", value: "true" },
      { target: "perks.representation.rank", value: "1" },
      { target: "perks.lan.misc", value: "{{ perks.discretion.rank }}" },
    ]);
  });

  test("a group's binding takes its text's new key, so a fill doesn't judge it stale", () => {
    const row = { id: "m1", target: "perks.reprsentation.rank", value: "1" };
    const plan = planOf([row], [bindingOf("m1", {}, { kind: "group", name: "reprsentation" })]);
    expect(plan.rows.get("m1")?.target).toBe("perks.representation.rank");
    expect([...plan.groups]).toEqual([["m1-target-0-1", "representation"]]);
  });

  test("a wildcard's prefix moves to the new key of the same start of the names it matched", () => {
    const rows = [
      { id: "m1", target: "perks.armedeprdilection*.misc", value: "1" },
      { id: "m2", target: "perks.armede*.misc", value: "1" },
    ];
    const plan = planOf(rows);
    expect(plan.rows.get("m1")?.target).toBe("perks.armedepredilection*.misc");
    expect(plan.rows.has("m2")).toBe(false);
    // One that started names whose starts now differ: left, and listed
    expect(planOf([{ id: "m3", target: "perks.prd*.misc", value: "1" }]).unsettled).toEqual([
      { field: "target", held: "prd*", keys: ["pred*", "prad*"], rowId: "m3" },
    ]);
  });

  test("an old key two names had is left as it is, and listed with the keys it could be", () => {
    const plan = planOf([{ id: "m1", target: "perks.prdiction.misc", value: "1" }]);
    expect(plan.rows.size).toBe(0);
    expect(plan.unsettled).toEqual([
      { field: "target", held: "prdiction", keys: ["prediction", "pradiction"], rowId: "m1" },
    ]);
  });

  test("holding an accented letter, which no old key held: stays as it is, whatever its plain letters name", () => {
    const rows = [
      { id: "m1", target: "perks.pré*.misc", value: "1" },
      { id: "m2", target: "perks.pécheur.misc", value: "1" },
    ];
    const plan = planOf(rows, [bindingOf("m2", {}, { kind: "group", name: "pécheur" })]);
    expect(plan).toEqual({ clashes: [], groups: new Map(), rows: new Map(), unsettled: [] });
  });

  test("an old key that names an entity now, and was another name's old key: left, and listed with both", () => {
    const plan = planOf([{ id: "m1", target: "perks.lan.misc", value: "1" }]);
    expect(plan.rows.size).toBe(0);
    expect(plan.unsettled).toEqual([{ field: "target", held: "lan", keys: ["lan", "elan"], rowId: "m1" }]);
  });

  test("a text that names nothing under either key, or a word the paths use themselves, stays as it is", () => {
    const rows = [
      { id: "m1", target: "perks.unknown.misc", value: "1" },
      { id: "m2", target: "perks.budget", value: "1" },
    ];
    expect(planOf(rows)).toEqual({ clashes: [], groups: new Map(), rows: new Map(), unsettled: [] });
  });
});

describe("Names the new keys read as one", () => {
  const names = [...NAMES, "Côte", "Cote"];

  test("are listed, of each kind a path names, which their old keys told apart", () => {
    const plan = planOf([], [], names);
    expect(plan.clashes).toEqual([{ entityType: "owners", key: "cote", names: ["Côte", "Cote"] }]);
    // "Élan" and "Lan" shared an old key and have keys of their own now; "Lan " and "Lan" shared one before already
    expect(planOf([], [], [...NAMES, "Lan "]).clashes).toEqual([]);
  });

  test("leave a rule whose old key would move to their key as it is, listed with them, bound or not", () => {
    const rows = [
      { id: "m1", target: "perks.cte.misc", value: "1" },
      { id: "m2", target: "perks.climb.misc", value: "{{ perks.cte.rank }}" },
    ];
    const bindings = [bindingOf("m1", {}, { entityId: "o9", name: "Côte" })];

    const plan = planOf(rows, bindings, names);

    expect(plan.rows.size).toBe(0);
    expect(plan.unsettled).toEqual([
      { field: "target", held: "cte", keys: ["cote"], names: ["Côte", "Cote"], rowId: "m1" },
      { field: "value", held: "cte", keys: ["cote"], names: ["Côte", "Cote"], rowId: "m2" },
    ]);
  });

  test("leave their own key in a rule as it is: it was an old key already, which the rules read as either", () => {
    const plan = planOf([{ id: "m1", target: "perks.cote.misc", value: "1" }], [], names);
    expect([plan.rows.size, plan.unsettled]).toEqual([0, []]);
  });
});
