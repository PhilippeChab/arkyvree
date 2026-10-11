import { expect } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { createCampaign, postPlayerInvite } from "@/tests/e2e/support/campaigns.ts";
import { unreadCount } from "@/tests/e2e/support/notifications.ts";
import { uniqueName } from "@/tests/e2e/support/page.ts";
import { signedInPage, signIn } from "@/tests/e2e/support/signIn.ts";

// What the server pushes to an open page over its websocket. The bell also refetches every minute on its own, so the
// test waits for the push itself, then for the bell it updates.
test.describe("An open page", () => {
  test("counts a new notification on its bell as it comes, without a reload", async ({
    page,
    browser,
    ownerUser,
    user,
  }) => {
    const frames: string[] = [];
    page.on("websocket", (socket) => socket.on("framereceived", (frame) => frames.push(String(frame.payload))));
    await signIn(page, user.email, user.password);
    // Connected: the server greets a socket with its version
    await expect.poll(() => frames.some((frame) => frame.includes("app:version")), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => unreadCount(page)).toBe(0);
    let loads = 0;
    page.on("load", () => loads++);

    const gm = await signedInPage(browser, ownerUser);
    try {
      const id = await createCampaign(gm, uniqueName("Realtime Campaign"));
      await postPlayerInvite(gm, id, user.email);
    } finally {
      await gm.context().close();
    }

    await expect
      .poll(() => frames.some((frame) => frame.includes("notifications:updated")), { timeout: 15_000 })
      .toBe(true);
    await expect.poll(() => unreadCount(page), { timeout: 10_000 }).toBe(1);
    expect(loads).toBe(0);
  });
});
