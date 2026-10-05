import { describe, expect, test } from "bun:test";

import {
  collectDiff,
  diffIsEmpty,
  renderHuman,
  renderSql,
  sqlLiteral,
  stripVolatile,
} from "@/scripts/ops/diff/rows.ts";

const UUID = "0b9c6a1e-3f5d-4c2a-9e8b-7d6f5a4b3c2d";

const row = (bk: string, fields: Record<string, unknown>, id = `${bk}-id`) => ({ bk, id, row: fields });

describe("A compared row", () => {
  test("keeps its content, without bookkeeping columns nor any id another seed would draw anew", () => {
    expect(
      stripVolatile({
        id: UUID,
        ruleset_id: UUID,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        name: "Dodge",
        selectable: true,
        cost: 5,
        source_item_id: UUID,
        properties: { hd: 8 },
      }),
    ).toEqual({ name: "Dodge", selectable: true, cost: 5, properties: { hd: 8 } });
  });
});

describe("A table's diff", () => {
  test("is the rows on one side only and the fields that differ, by business key", () => {
    const diff = collectDiff(
      [row("Dodge", { level: 1 }), row("Cleave", { level: 1 }), row("Alertness", { tags: ["a"] })],
      [row("Dodge", { level: 2 }, "target-dodge"), row("Power Attack", {}), row("Alertness", { tags: ["a"] })],
    );
    expect(diff).toEqual({
      onlyInRef: ["Cleave"],
      onlyInTgt: ["Power Attack"],
      fieldChanges: [{ bk: "Dodge", targetId: "target-dodge", field: "level", ref: 1, tgt: 2 }],
    });
    expect(diffIsEmpty(diff)).toBe(false);
    expect(diffIsEmpty(collectDiff([row("Dodge", { level: 1 })], [row("Dodge", { level: 1 })]))).toBe(true);
  });

  test("compares objects, arrays and dates by value", () => {
    const changes = (ref: unknown, tgt: unknown) =>
      collectDiff([row("x", { field: ref })], [row("x", { field: tgt })]).fieldChanges.length;
    expect(changes({ a: [1, 2] }, { a: [1, 2] })).toBe(0);
    expect(changes({ a: [1, 2] }, { a: [2, 1] })).toBe(1);
    expect(changes(new Date("2026-01-01"), new Date("2026-01-01"))).toBe(0);
    expect(changes(new Date("2026-01-01"), new Date("2026-01-02"))).toBe(1);
    expect(changes(null, 0)).toBe(1);
  });

  test("writes a field that references other rows as a comment: its value is their names, which no id column takes", () => {
    const diff = collectDiff(
      [row("Spiked Shield", { source_item_id: "Core: Shield" })],
      [row("Spiked Shield", { source_item_id: "Core: Dagger" }, "t1")],
    );
    expect(renderSql("rules.items", diff, ["source_item_id"])).toEqual([
      "-- rules.items:",
      '--   Spiked Shield.source_item_id: reference "Core: Shield", target "Core: Dagger" (UPDATE skipped — it references other rows)',
    ]);
  });

  test("reads for a person, and as the SQL that aligns the target, its one-sided rows as comments", () => {
    const diff = collectDiff(
      [row("Dodge", { description: "It's dodgy" }), row("Cleave", {})],
      [row("Dodge", { description: "x" }, "t1")],
    );
    expect(renderHuman(diff)).toEqual([
      "only in reference: Cleave",
      "Dodge.description:",
      '  reference: "It\'s dodgy"',
      '  target:    "x"',
    ]);
    expect(renderSql("rules.feats", diff)).toEqual([
      "-- rules.feats:",
      "--   only in reference: Cleave (INSERT skipped — FK remap required)",
      "UPDATE rules.feats SET description = $q$It's dodgy$q$ WHERE id = $q$t1$q$;  -- Dodge",
    ]);
  });
});

describe("A SQL literal", () => {
  test("quotes text with a dollar tag the text doesn't hold, and writes anything else as its value or jsonb", () => {
    expect(sqlLiteral("plain")).toBe("$q$plain$q$");
    expect(sqlLiteral("has $q$ inside")).toBe("$qq$has $q$ inside$qq$");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(undefined)).toBe("NULL");
    expect(sqlLiteral(false)).toBe("false");
    expect(sqlLiteral(1.5)).toBe("1.5");
    expect(sqlLiteral({ a: "x" })).toBe('$q${"a":"x"}$q$::jsonb');
  });
});
