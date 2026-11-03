import { describe, expect, test } from "bun:test";

import { parseCrontab } from "graphile-worker";

import { crontab } from "@/server/jobs/runner.ts";

const HOUR = 60 * 60 * 1000;

describe("the worker's schedule", () => {
  test("backfills the cleanup's last day and the sweep's last hour", () => {
    expect(parseCrontab(crontab).map(({ task, options }) => [task, options.backfillPeriod])).toEqual([
      ["runCleanup", 24 * HOUR],
      ["sweepPendingBlobs", HOUR],
    ]);
  });
});
