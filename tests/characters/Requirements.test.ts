import DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import type { Holders, TargetPathsTraverser, TraversePathResult } from "@/server/rulesets/types.ts";
import type { Requirement } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "req-1",
    entityId: "entity-1",
    entityType: "feats",
    level: "1",
    target: "feats.weaponfocus.*.possessed",
    operator: "equal",
    value: "true",
    valueType: "boolean",
    chainingOperator: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTraverser(resultsFn: (target: string) => TraversePathResult[]): TargetPathsTraverser {
  return {
    traversePathInit: (_target: string, _holders: Holders) => resultsFn(_target),
  };
}

function makeResult(data: unknown, error: string | null = null): TraversePathResult {
  return {
    holder: error ? null : {},
    object: error ? null : { key: data },
    data,
    key: "possessed",
    resolvedPath: error ? null : "feats.test.possessed",
    error,
  };
}

describe("DetailedCharacterRequirements - wildcard OR semantics", () => {
  const holders: Holders = {};

  test("single result fulfilled — requirement is met", () => {
    const traverser = makeTraverser(() => [makeResult(true)]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement()]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(unmetRequirementGroups).toHaveLength(0);
  });

  test("single result not fulfilled — requirement is unmet", () => {
    const traverser = makeTraverser(() => [makeResult(false)]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement()]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(0);
    expect(unmetRequirementGroups).toHaveLength(1);
  });

  test("wildcard: any match fulfills requirement (OR semantics)", () => {
    // Simulates feats.weaponfocus.*.possessed expanding to 3 feats, only one possessed
    const traverser = makeTraverser(() => [
      makeResult(false),
      makeResult(true),
      makeResult(false),
    ]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement()]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(unmetRequirementGroups).toHaveLength(0);
  });

  test("wildcard: no matches — requirement is unmet", () => {
    const traverser = makeTraverser(() => [
      makeResult(false),
      makeResult(false),
      makeResult(false),
    ]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement()]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(0);
    expect(unmetRequirementGroups).toHaveLength(1);
  });

  test("wildcard: error results are tracked, valid results still use OR", () => {
    const traverser = makeTraverser(() => [
      makeResult(null, "Element not found: badpath"),
      makeResult(true),
    ]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement()]]);

    const { fulfilledRequirementGroups, invalidRequirements } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(invalidRequirements).toHaveLength(1);
    expect(invalidRequirements[0].warning).toContain("Element not found");
  });

  test("wildcard: only error results — no node created, group is fulfilled (empty tree)", () => {
    const traverser = makeTraverser(() => [
      makeResult(null, "Element not found: x"),
      makeResult(null, "Element not found: y"),
    ]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement()]]);

    const { invalidRequirements } = req.getRequirements();
    expect(invalidRequirements).toHaveLength(2);
  });

  test("wildcard produces single node — multiple requirements in group still work", () => {
    // Two requirements in same group: one wildcard (OR), one flat
    const traverser = makeTraverser((target) => {
      if (target.includes("*")) {
        return [makeResult(false), makeResult(true)]; // OR → true
      }
      return [makeResult(3)]; // flat → fighter level 3
    });
    const req = new DetailedCharacterRequirements(traverser);

    const wildcardReq = makeRequirement({ id: "req-1", level: "1" });
    const flatReq = makeRequirement({
      id: "req-2",
      level: "2",
      target: "classes.fighter.level",
      operator: "greater_than_or_equal",
      value: "1",
      valueType: "number",
    });

    req.evaluateRequirements(holders, [[wildcardReq, flatReq]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(unmetRequirementGroups).toHaveLength(0);
  });

  test("wildcard with numeric comparison — greater_than uses OR", () => {
    // Requirement: any spell DC total > 15
    const traverser = makeTraverser(() => [
      makeResult(14),
      makeResult(16),
      makeResult(13),
    ]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement({
      target: "powers.groups.evocation.*.dc.total",
      operator: "greater_than",
      value: "15",
      valueType: "number",
    })]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(unmetRequirementGroups).toHaveLength(0);
  });

  test("feat count requirement — greater_than_or_equal fulfilled", () => {
    const traverser = makeTraverser(() => [makeResult(3)]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement({
      target: "feats.toughness.count",
      operator: "greater_than_or_equal",
      value: "2",
      valueType: "number",
    })]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(unmetRequirementGroups).toHaveLength(0);
  });

  test("feat count requirement — not enough stacks is unmet", () => {
    const traverser = makeTraverser(() => [makeResult(1)]);
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement({
      target: "feats.toughness.count",
      operator: "greater_than_or_equal",
      value: "3",
      valueType: "number",
    })]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(0);
    expect(unmetRequirementGroups).toHaveLength(1);
  });
});

describe("DetailedCharacterRequirements - template expressions on value", () => {
  const holders: Holders = {};

  // Traverser that knows two paths: the requirement's LHS target and the
  // template's bracketed RHS path. Returns the per-path stub data.
  const makeDualTraverser = (lhs: { target: string; data: unknown }, rhs: { path: string; data: unknown } | null) =>
    makeTraverser((target) => {
      if (target === lhs.target) return [makeResult(lhs.data)];
      if (rhs && target === rhs.path) return [makeResult(rhs.data)];
      return [makeResult(null, `Element not found: ${target}`)];
    });

  test("template resolves and requirement is met (equal)", () => {
    // requirement: classes.druid.level >= classes.fighter.level (both 5)
    const traverser = makeDualTraverser(
      { target: "classes.druid.level", data: 5 },
      { path: "classes.fighter.level", data: 5 },
    );
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement({
      target: "classes.druid.level",
      operator: "greater_than_or_equal",
      value: "{{ [classes.fighter.level] }}",
      valueType: "number",
    })]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(unmetRequirementGroups).toHaveLength(0);
  });

  test("template resolves but lhs < rhs — requirement is unmet", () => {
    const traverser = makeDualTraverser(
      { target: "classes.druid.level", data: 3 },
      { path: "classes.fighter.level", data: 5 },
    );
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement({
      target: "classes.druid.level",
      operator: "greater_than_or_equal",
      value: "{{ [classes.fighter.level] }}",
      valueType: "number",
    })]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(0);
    expect(unmetRequirementGroups).toHaveLength(1);
  });

  test("compound template with arithmetic — half-rate comparison", () => {
    // requirement: classes.ranger.level >= floor(classes.fighter.level / 2)
    //   ranger=4, fighter=6 → floor(6/2)=3, 4 >= 3 → met
    const traverser = makeDualTraverser(
      { target: "classes.ranger.level", data: 4 },
      { path: "classes.fighter.level", data: 6 },
    );
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement({
      target: "classes.ranger.level",
      operator: "greater_than_or_equal",
      value: "{{ floor([classes.fighter.level] / 2) }}",
      valueType: "number",
    })]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(unmetRequirementGroups).toHaveLength(0);
  });

  test("template referencing unresolvable path — requirement is unmet", () => {
    const traverser = makeDualTraverser(
      { target: "classes.druid.level", data: 5 },
      null, // no RHS — template path won't resolve
    );
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement({
      target: "classes.druid.level",
      operator: "greater_than_or_equal",
      value: "{{ [classes.bard.level] }}",
      valueType: "number",
    })]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(0);
    expect(unmetRequirementGroups).toHaveLength(1);
  });

  test("legacy bare-path template (no brackets) — still resolves", () => {
    const traverser = makeDualTraverser(
      { target: "classes.druid.level", data: 5 },
      { path: "classes.fighter.level", data: 5 },
    );
    const req = new DetailedCharacterRequirements(traverser);

    req.evaluateRequirements(holders, [[makeRequirement({
      target: "classes.druid.level",
      operator: "equal",
      value: "{{ classes.fighter.level }}",
      valueType: "number",
    })]]);

    const { fulfilledRequirementGroups, unmetRequirementGroups } = req.getRequirements();
    expect(fulfilledRequirementGroups).toHaveLength(1);
    expect(unmetRequirementGroups).toHaveLength(0);
  });
});
