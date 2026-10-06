import { describe, expect, test } from "bun:test";

import { APP_URL } from "@/emails/EmailLayout.tsx";
import emailService from "@/server/emails/EmailService.ts";
import { renderEmail } from "@/server/emails/templates.ts";
import { queuedJobs } from "@/tests/support/jobs.ts";
import { uniqueId } from "@/tests/support/seed.ts";

/** Runs `run` as the app does outside the tests, where emails are queued for the worker. */
async function outsideTests<T>(run: () => Promise<T>) {
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    return await run();
  } finally {
    process.env.NODE_ENV = env;
  }
}

describe("EmailService.send", () => {
  test("queues nothing in the tests", async () => {
    const subject = `Welcome ${uniqueId()}`;
    expect(
      await emailService.send({ to: "someone@example.com", subject, template: "welcome", props: { username: "Ada" } }),
    ).toEqual({ success: false, error: "Email service not configured" });
    expect(await queuedJobs("subject", subject)).toEqual([]);
  });

  test("queues one job for the worker, with the template and its props", async () => {
    const subject = `Welcome ${uniqueId()}`;
    const sent = await outsideTests(() =>
      emailService.send({
        to: ["ada@example.com", "grace@example.com"],
        subject,
        template: "welcome",
        props: { username: "Ada" },
      }),
    );

    expect(sent).toEqual({ success: true });
    const [job, ...others] = await queuedJobs("subject", subject);
    expect(others).toEqual([]);
    expect(job.task).toBe("sendEmail");
    expect(job.payload).toEqual({
      to: ["ada@example.com", "grace@example.com"],
      from: "Arkyvree <notifications@arkyvree.com>",
      subject,
      template: "welcome",
      props: { username: "Ada" },
    });
  });

  test("drops demo accounts' addresses, and queues nothing when none is left", async () => {
    const subject = `Welcome ${uniqueId()}`;
    const sent = await outsideTests(() =>
      emailService.send({
        to: ["demo-1@demo.invalid", "demo-2@demo.invalid"],
        subject,
        template: "welcome",
        props: {},
      }),
    );

    expect(sent).toEqual({ success: true });
    expect(await queuedJobs("subject", subject)).toEqual([]);
  });

  test("reports a job it couldn't queue", async () => {
    // Props that can't be serialized, as a template's could by mistake
    const sent = await outsideTests(() =>
      emailService.send({
        to: "ada@example.com",
        subject: "Welcome",
        template: "welcome",
        props: { username: 1n } as never,
      }),
    );
    expect(sent.success).toBe(false);
    expect(sent.error).toMatch(/BigInt/);
  });
});

describe("renderEmail", () => {
  const inviteId = uniqueId();

  test.each([
    ["welcome", { username: "Ada" }, ["Ada"]],
    ["emailVerification", { code: "123456" }, ["123456"]],
    ["emailChangeVerification", { code: "234567" }, ["234567"]],
    ["passwordReset", { code: "345678" }, ["345678"]],
    [
      "campaignInvitation",
      { inviteeName: "Ada", inviterName: "Grace", campaignName: "Storm King", inviteId },
      ["Ada", "Grace", "Storm King", `${APP_URL}/campaign-invite/${inviteId}`],
    ],
    [
      "contributorInvitation",
      { inviteeName: "Ada", inviterName: "Grace", rulesetName: "Homebrew", role: "Editor", contributorId: inviteId },
      ["Ada", "Grace", "Homebrew", "Editor", `${APP_URL}/ruleset-contributor-invite/${inviteId}`],
    ],
    [
      "characterContributorInvitation",
      { inviteeName: "Ada", inviterName: "Grace", characterName: "Elara", contributorId: inviteId },
      ["Ada", "Grace", "Elara", `${APP_URL}/character-contributor-invite/${inviteId}`],
    ],
  ] as const)("renders %s, in HTML and in plain text", (template, props, content) => {
    const { html, text } = renderEmail({ template, props } as Parameters<typeof renderEmail>[0]);
    expect(html).toStartWith("<!DOCTYPE html");
    for (const piece of content) {
      expect(html).toContain(piece);
      expect(text).toContain(piece);
    }
    expect(text).not.toContain("<");
  });

  test("renders a template's defaults when a prop is missing", () => {
    expect(renderEmail({ template: "emailVerification", props: {} }).text).toContain("000000");
  });

  test("refuses a template it doesn't know, as a stale job could name", () => {
    expect(() => renderEmail({ template: "newsletter", props: {} } as never)).toThrow(
      "Unknown email template: newsletter",
    );
  });
});
