import { describe, expect, test } from "bun:test";

import { Field, type LeafSpec } from "@/engine/core/fields/index.ts";
import type { StandaloneKind } from "@/engine/core/view/index.ts";

/** What every leaf declares besides its kind. */
const BASE = { description: "It", label: "It", field: "IT", merge: "winner" } as const;

/** The made-up kind a reference names: one no module declares, typed as the view's registry types a kind. */
const GIZMOS = "gizmos" as string as StandaloneKind;

describe("Field", () => {
  test("reads a leaf as required when a form never leaves it at none", () => {
    const required: [LeafSpec, boolean][] = [
      [{ ...BASE, kind: "flag" }, true],
      [{ ...BASE, kind: "flag", absent: null }, false],
      [{ ...BASE, kind: "number", default: 0 }, true],
      [{ ...BASE, kind: "number" }, false],
      [{ ...BASE, kind: "text", default: "A", required: true, values: ["A"] }, true],
      [{ ...BASE, kind: "text", default: "A" }, false],
      [{ ...BASE, kind: "choice", required: true, values: ["A"] }, true],
      [{ ...BASE, kind: "choice", values: ["A"] }, false],
      [{ description: "It", label: "It", kind: "ref", references: GIZMOS, required: true, role: "it" }, true],
      [{ description: "It", label: "It", kind: "ref", references: GIZMOS, role: "it" }, false],
      [{ ...BASE, kind: "list" }, false],
    ];
    for (const [leaf, isRequired] of required)
      expect([leaf.kind, Field.isRequired(leaf)]).toEqual([leaf.kind, isRequired]);
  });
});
