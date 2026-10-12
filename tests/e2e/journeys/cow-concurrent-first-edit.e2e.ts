import { expect } from "@playwright/test";
import { z } from "zod";

import { test } from "@/tests/e2e/fixtures.ts";
import { uniqueName } from "@/tests/e2e/support/page.ts";
import { visitCoreRulesetList } from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

test("concurrent first edits preserve every modifier on one fork copy", async ({ page, ownerUser }) => {
  await signIn(page, ownerUser.email, ownerUser.password);
  await visitCoreRulesetList(page);
  await page.getByRole("heading", { name: "Core SRD 3.5" }).first().click();
  const baseId = page.url().match(/\/rulesets\/([a-f0-9-]+)/)?.[1];
  expect(baseId).toBeTruthy();

  const forkName = uniqueName("Concurrent COW");
  await page.getByRole("button", { name: "More Actions" }).first().click();
  await page.getByRole("menuitem", { name: /^Fork\b/ }).click();
  const dialog = page.getByRole("dialog", { name: "Fork Ruleset" });
  await dialog.locator('input[name="name"]').fill(forkName);
  await dialog.getByRole("button", { name: /Fork Ruleset/ }).click();
  await expect(page.getByRole("heading", { name: forkName })).toBeVisible();
  await page.getByRole("tab", { name: "Races" }).click();
  await page.getByText("Human", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/races\/[a-f0-9-]+\/customization/);
  const ids = page.url().match(/\/rulesets\/([a-f0-9-]+)\/races\/([a-f0-9-]+)/);
  expect(ids).toBeTruthy();
  const [, forkId, sourceId] = ids!;
  const modifiersUrl = (rulesetId: string, entityId: string) =>
    `/api/rulesets/${rulesetId}/customization/races/${entityId}/modifiers`;
  const parentBefore = await page.request.get(modifiersUrl(baseId!, sourceId));
  expect(parentBefore.ok()).toBe(true);
  const parentModifiers: unknown = await parentBefore.json();

  // Independent HTTP requests use separate database transactions. The burst
  // exercises the first-copy window that single-transaction unit tests miss.
  const values = Array.from({ length: 8 }, (_, index) => String(100 + index));
  const responses = await Promise.all(
    values.map((value) =>
      page.request.post(modifiersUrl(forkId, sourceId), {
        data: { target: "abilities.strength.misc", value, operator: "add" },
      }),
    ),
  );
  const copiedIds = new Set<string>();
  for (const response of responses) {
    expect(response.status(), await response.text()).toBe(201);
    copiedIds.add(z.object({ resolvedEntityId: z.string().uuid() }).parse(await response.json()).resolvedEntityId);
  }
  expect(copiedIds.size).toBe(1);
  const [copyId] = [...copiedIds];
  expect(copyId).not.toBe(sourceId);
  const modifiers = await page.request.get(modifiersUrl(forkId, copyId));
  expect(modifiers.ok()).toBe(true);
  const rows = z.array(z.object({ value: z.string() })).parse(await modifiers.json());
  for (const value of values) expect(rows.filter((row) => row.value === value)).toHaveLength(1);
  const parentAfter = await page.request.get(modifiersUrl(baseId!, sourceId));
  expect(parentAfter.ok()).toBe(true);
  expect(await parentAfter.json()).toEqual(parentModifiers);
});
