import { expect } from "@playwright/test";
import type { InferResponseType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";
import { test } from "@/tests/e2e/fixtures.ts";
import { uniqueName } from "@/tests/e2e/support/page.ts";
import { forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";
import { ITEM_IS_TEMPLATE } from "@/vocabulary/dnd3.5/fields/index.ts";

type DuplicatedItem = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"][":entityId"]["duplicate"]["$post"],
  201
>;
type EditedItem = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"][":entityId"]["$put"],
  200
>;
type Templates = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"]["templates"]["$get"],
  200
>;

for (const width of [375, 1280]) {
  test.describe(`Item template editor at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("templates stay editable without a source selector, while variants retain it", async ({ page, ownerUser }) => {
      await signIn(page, ownerUser.email, ownerUser.password);
      const forkId = await forkCoreRuleset(page, uniqueName(`Template source ${width}`));

      const templatesResponse = await page.request.get(`/api/rulesets/${forkId}/entities/items/templates?type=Weapon`);
      expect(templatesResponse.ok()).toBe(true);
      const templates: Templates = await templatesResponse.json();
      const mace = templates.find((item) => item.name === "Heavy Mace");
      if (!mace) throw new Error("Heavy Mace seed template not found");

      await page.goto(`/rulesets/${forkId}/items/${mace.id}/customization`);
      await expect(page.locator('input[name="name"]')).toHaveValue("Heavy Mace");
      await expect(page.getByText("Weapon Template", { exact: true })).toHaveCount(0);
      await page.locator('textarea[name="description"]').fill("Homebrew heavy mace template");
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/rulesets/${forkId}/entities/items/`) && response.request().method() === "PUT",
      );
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const saveResponse = await saved;
      expect(saveResponse.ok()).toBe(true);
      const edited: EditedItem = await saveResponse.json();
      expect(edited.fields[ITEM_IS_TEMPLATE]).toBe(true);
      expect(edited.links).toEqual([]);
      expect(edited.description).toBe("Homebrew heavy mace template");

      await page.reload();
      await expect(page.locator('textarea[name="description"]')).toHaveValue("Homebrew heavy mace template");
      await expect(page.getByText("Weapon Template", { exact: true })).toHaveCount(0);

      const duplicateResponse = await page.request.post(
        `/api/rulesets/${forkId}/entities/items/${edited.id}/duplicate`,
        {
          data: { name: "Heavy Mace +3", type: "Weapon" },
        },
      );
      expect(duplicateResponse.ok()).toBe(true);
      const copy: DuplicatedItem = await duplicateResponse.json();
      expect(copy.fields[ITEM_IS_TEMPLATE]).toBe(false);
      expect(copy.links).toEqual([
        expect.objectContaining({ role: "madeFrom", toId: edited.id, toName: "Heavy Mace" }),
      ]);

      await page.goto(`/rulesets/${forkId}/items/${copy.id}/customization`);
      await expect(page.locator('input[name="name"]')).toHaveValue("Heavy Mace +3");
      await expect(page.getByRole("combobox", { name: "Weapon Template" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Weapon Template" })).toHaveText("Heavy Mace");
    });
  });
}
