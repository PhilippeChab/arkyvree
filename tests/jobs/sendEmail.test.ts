import { expect, test } from "bun:test";

import type { JobHelpers } from "graphile-worker";

import { sendEmailTask } from "@/server/jobs/sendEmail.ts";
import { withEnvironment } from "@/tests/support/environment.ts";

const PAYLOAD = {
  to: ["ada@example.com"],
  from: "Arkyvree <notifications@arkyvree.com>",
  subject: "Welcome",
  template: "welcome",
  props: { username: "Ada" },
};

/** A job's helpers, as the task reads them: its logger, which keeps what it warns. */
function newHelpers(warnings: string[]) {
  return { logger: { info: () => undefined, warn: (line: string) => warnings.push(line) } } as unknown as JobHelpers;
}

test("a production worker with no way to send fails the job, which is retried and reported, never dropped", async () => {
  const warnings: string[] = [];
  expect(
    withEnvironment({ NODE_ENV: "production" }, () => sendEmailTask(PAYLOAD, newHelpers(warnings))),
  ).rejects.toEqual(new Error("Email service not configured"));
  expect(warnings).toEqual([]);
});

test("elsewhere it skips the send, and says so", async () => {
  const warnings: string[] = [];
  await sendEmailTask(PAYLOAD, newHelpers(warnings));
  expect(warnings).toEqual(["Email service not configured — skipping send to ada@example.com"]);
});
