import { describe, expect, test } from "bun:test";

import TargetLabels from "@/engine/core/customizations/TargetLabels.ts";

describe("A target's labels", () => {
  const labels = {
    stats: "Stats",
    might: "Might",
    modifier: "Modifier",
    tracks: "Tracks",
    scout: "Scout",
  };

  test("are those of its path's segments that have one", () => {
    expect(TargetLabels.pick(["stats.might.unknown"], labels)).toEqual({
      stats: "Stats",
      might: "Might",
    });
  });

  test("are those of a template's path, bare or bracketed, and of every path of an expression", () => {
    const might = { stats: "Stats", might: "Might", modifier: "Modifier" };
    expect(TargetLabels.pick(["{{ stats.might.modifier }}"], labels)).toEqual(might);
    expect(TargetLabels.pick(["{{ [stats.might.modifier] }}"], labels)).toEqual(might);
    expect(TargetLabels.pick(["{{ floor([tracks.scout.level] / 2) + [stats.might.modifier] }}"], labels)).toEqual({
      ...might,
      tracks: "Tracks",
      scout: "Scout",
    });
  });

  test("are none of a value that's neither a path nor a template's", () => {
    expect(TargetLabels.pick(["2", "{{ 1 + 2 }}"], labels)).toEqual({});
  });
});
