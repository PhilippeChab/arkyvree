import { expect } from "@playwright/test";
import { parseResponse } from "hono/client";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiOf } from "@/tests/e2e/support/api.ts";
import { apiResponse, selectOption, uniqueName } from "@/tests/e2e/support/page.ts";
import { forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

// Writing a class of one's own in a fork: its hit die and its caster type, a level (its base attack bonus, a save and
// skill points), and its class skills. A class of its own, not an inherited one: the copy-on-write of inherited
// entities has tests of its own (fork-changes, cow-*).
test.describe("A class created in a fork", () => {
  test("gets a level and a class skill, which it can lose again", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Class Fork"));
    const name = uniqueName("Test Class");

    // Created, it opens on its progression, no levels yet
    await page.goto(`/rulesets/${forkId}/classes`);
    await page.getByRole("button", { name: "Add Class" }).click();
    const create = page.getByRole("dialog", { name: "Create New Class" });
    await create.getByLabel("Name", { exact: true }).fill(name);
    await selectOption(page, "Hit Die", "d10");
    await expect(create.getByRole("combobox", { name: "Hit Die" })).toHaveText("d10");
    // A field its ruleset declares for classes, beside its own
    await selectOption(page, "Caster Type", "Arcane");
    await create.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(new RegExp(`/rulesets/${forkId}/classes/[a-f0-9-]+/progression`), {
      timeout: 10_000,
    });
    // Its editor's overview edits it in place
    await expect(page.getByRole("combobox", { name: "Hit Die" })).toHaveText("d10");
    await expect(page.getByRole("combobox", { name: "Caster Type" })).toHaveText("Arcane");
    await expect(page.getByText("No levels", { exact: true })).toBeVisible();

    // A level: the table shows what it was given, after a reload too
    await page.getByRole("button", { name: "Add Level" }).click();
    const level = page.getByRole("dialog", { name: "Create New Level" });
    // Always the class's next level, which the dialog names
    await expect(level.getByText(`Adds level 1 to ${name}.`, { exact: true })).toBeVisible();
    // Its tracks' presets at level 1: a good base attack bonus (+1), a good Fortitude (+2), poor Reflex and Will (+0)
    await level.getByRole("group", { name: "Base Attack Bonus" }).getByRole("button", { name: "Good (full)" }).click();
    await level.getByRole("group", { name: "Fortitude" }).getByRole("button", { name: "Good" }).click();
    await level.getByRole("group", { name: "Reflex" }).getByRole("button", { name: "Poor" }).click();
    await level.getByRole("group", { name: "Will" }).getByRole("button", { name: "Poor" }).click();
    await level.getByLabel("Skill Points").fill("4");
    const created = apiResponse(page, "POST", /\/entities\/classes\/[a-f0-9-]+\/owned\/many$/);
    await level.getByRole("button", { name: "Create" }).click();
    await created;
    await page.reload();
    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "+1", exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row.getByRole("cell", { name: "+2", exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "4", exact: true })).toBeVisible();

    // A class skill, found by search, kept after a reload, then removed
    await page.getByRole("tab", { name: "Skills" }).click();
    await expect(page.getByText("No class skills assigned", { exact: true })).toBeVisible();
    await page.getByLabel("Add Skill").fill("Climb");
    const added = apiResponse(page, "POST", /\/entities\/classes\/[a-f0-9-]+\/links$/);
    // An option's name is the skill's, then its description
    await page.getByRole("option", { name: /^Climb\b/ }).click();
    await added;
    await page.reload();
    const skill = page.locator(".MuiChip-root").filter({ hasText: /^Climb$/ });
    await expect(skill).toBeVisible({ timeout: 10_000 });

    await skill.locator(".MuiChip-deleteIcon").click();
    const removed = apiResponse(page, "DELETE", /\/entities\/classes\/[a-f0-9-]+\/links\//);
    await page.getByRole("dialog", { name: "Remove Skill" }).getByRole("button", { name: "Remove Skill" }).click();
    await removed;
    await expect(skill).toHaveCount(0);
    await expect(page.getByText("No class skills assigned", { exact: true })).toBeVisible();
  });
});

// A new class's first ten levels in one dialog: each track's preset picked once, every level taking its value there.
test.describe("A class built from scratch", () => {
  test("gets ten levels at once, each track following the preset picked for it", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Levels Fork"));
    const className = uniqueName("Batch Class");
    const classId = await parseResponse(
      apiOf(page).api.rulesets[":id"].entities[":entityType"].$post({
        param: { id: forkId, entityType: "classes" },
        json: { name: className },
      }),
    ).then((created) => created.id);
    await page.goto(`/rulesets/${forkId}/classes/${classId}/progression`);
    await expect(page.getByText("No levels", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add Level" }).click();
    await page.getByRole("dialog", { name: "Create New Level" }).getByRole("button", { name: "10" }).click();
    const levels = page.getByRole("dialog", { name: "Create New Levels" });
    await expect(levels.getByText(`Adds levels 1 to 10 to ${className}.`, { exact: true })).toBeVisible();
    await levels.getByRole("group", { name: "Base Attack Bonus" }).getByRole("button", { name: "Medium (¾)" }).click();
    await levels.getByRole("group", { name: "Fortitude" }).getByRole("button", { name: "Good" }).click();
    await levels.getByRole("group", { name: "Reflex" }).getByRole("button", { name: "Poor" }).click();
    await levels.getByRole("group", { name: "Will" }).getByRole("button", { name: "Poor" }).click();
    await levels.getByLabel("Skill Points").fill("4");
    const created = apiResponse(page, "POST", /\/entities\/classes\/[a-f0-9-]+\/owned\/many$/);
    await levels.getByRole("button", { name: "Create" }).click();
    await created;

    // The table shows them at once: the tenth's medium base attack bonus, good Fortitude, poor Reflex and Will
    await expect(page.getByText("10 class levels created")).toBeVisible();
    const tenth = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "+7/+2", exact: true }) });
    await expect(tenth).toHaveCount(1, { timeout: 10_000 });
    await expect(tenth.getByRole("cell", { name: "+7", exact: true })).toHaveCount(1);
    await expect(tenth.getByRole("cell", { name: "+3", exact: true })).toHaveCount(2);
    await expect(tenth.getByRole("cell", { name: "4", exact: true })).toBeVisible();
    // Its Progression reads the presets they follow
    await expect(
      page.getByRole("group", { name: "Base Attack Bonus" }).getByRole("button", { name: "Medium (¾)" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Set to Good on its Progression, Add Level waits for the change's save; saved, the next level starts at Good
    await page.getByRole("group", { name: "Base Attack Bonus" }).getByRole("button", { name: "Good (full)" }).click();
    await expect(page.getByRole("button", { name: "Add Level" })).toBeDisabled();
    const saved = apiResponse(page, "PUT", /\/entities\/classes\/[a-f0-9-]+\/progression$/);
    await page.getByRole("button", { name: "Save Progression" }).click();
    await saved;
    await expect(page.getByRole("button", { name: "Add Level" })).toBeEnabled({ timeout: 10_000 });
    await page.getByRole("button", { name: "Add Level" }).click();
    const next = page.getByRole("dialog", { name: "Create New Level" });
    await expect(next.getByText(`Adds level 11 to ${className}.`, { exact: true })).toBeVisible();
    await expect(
      next.getByRole("group", { name: "Base Attack Bonus" }).getByRole("button", { name: "Good (full)" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

// A class's Progression tab: a preset its base attack bonus follows, its skill points, its features and its pools'
// picks, and one save of them, which copies an inherited class into the fork.
test.describe("A class's progression", () => {
  test("of an inherited monk follows a good base attack bonus and 6 skill points, in one save", async ({
    page,
    ownerUser,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Progression Fork"));
    const { items } = await parseResponse(
      apiOf(page).api.rulesets[":id"].entities[":entityType"].$get({
        param: { id: forkId, entityType: "classes" },
        query: { search: "Monk" },
      }),
    );
    const monk = items.find((klass) => klass.name === "Monk")!;

    // An old tab's address opens the Progression tab
    await page.goto(`/rulesets/${forkId}/classes/${monk.id}/levels`);
    await expect(page).toHaveURL(new RegExp(`/classes/${monk.id}/progression`), { timeout: 10_000 });

    // A preset sets every level, which the table shows before the save
    await page.getByRole("button", { name: "Good (full)" }).click();
    await page.getByLabel("Points a Level").fill("6");
    // The class's table, the tab's first: the change's before and after are a table of their own
    const levels = page.getByRole("table").first();
    const lastRow = levels
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "+20/+15/+10/+5", exact: true }) });
    await expect(lastRow).toHaveCount(1);

    // The Spells tab and back keeps them
    await page.getByRole("tab", { name: "Spells" }).click();
    await page.getByRole("tab", { name: "Progression" }).click();
    await expect(page.getByRole("button", { name: "Good (full)" })).toHaveAttribute("aria-pressed", "true");

    // One save writes both, onto the fork's copy of the class, which the page follows
    const saved = apiResponse(page, "PUT", /\/entities\/classes\/[a-f0-9-]+\/progression$/);
    await page.getByRole("button", { name: "Save Progression" }).click();
    await saved;
    await expect(page).not.toHaveURL(new RegExp(`/classes/${monk.id}/`), { timeout: 10_000 });
    await page.reload();
    const first = page
      .getByRole("table")
      .first()
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "+1", exact: true }) })
      .first();
    await expect(first.getByRole("cell", { name: "6", exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Good (full)" })).toHaveAttribute("aria-pressed", "true");
  });

  test("of an inherited cleric moves a feature that doesn't stack, gives three domain picks and loses a feature, in one save", async ({
    page,
    ownerUser,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Features Fork"));
    const { items } = await parseResponse(
      apiOf(page).api.rulesets[":id"].entities[":entityType"].$get({
        param: { id: forkId, entityType: "classes" },
        query: { search: "Cleric" },
      }),
    );
    const cleric = items.find((klass) => klass.name === "Cleric")!;
    await page.goto(`/rulesets/${forkId}/classes/${cleric.id}/progression`);
    const levelOf = (row: string, level: number) =>
      page
        .getByRole("group", { name: `Levels of ${row}` })
        .getByRole("button", { name: new RegExp(`^Level ${level}:`) });

    // A feature that doesn't stack is granted at one level: the rules' note on another says a click moves it there
    await levelOf("Aura (Cleric)", 5).click({ timeout: 10_000 });
    await expect(levelOf("Aura (Cleric)", 5)).toHaveAttribute("aria-pressed", "true");
    await expect(levelOf("Aura (Cleric)", 1)).toHaveAttribute("aria-pressed", "false");
    await levelOf("Aura (Cleric)", 3).hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "Aura (Cleric) isn't Stackable, so it's granted at one level: a click moves it here from level 5.",
      { timeout: 10_000 },
    );

    // A filled pool level opens a box that sets its picks: the cleric's two domains, then a third
    await levelOf("Cleric Domain", 1).click();
    const picks = page.getByRole("dialog", { name: "Level 1 · Cleric Domain" });
    await picks.getByRole("button", { name: "More Picks" }).click();
    await expect(picks.getByText("3", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(levelOf("Cleric Domain", 1)).toHaveAccessibleName(/3 Picks/);

    // A row's bin clears its levels, and the save takes it off the class
    const proficiency = "Weapon and Armor Proficiency (Cleric)";
    await page.getByRole("button", { name: `Remove ${proficiency}` }).click();
    await expect(levelOf(proficiency, 1)).toHaveAttribute("aria-pressed", "false");
    const saved = apiResponse(page, "PUT", /\/entities\/classes\/[a-f0-9-]+\/progression$/);
    await page.getByRole("button", { name: "Save Progression" }).click();
    await saved;
    await expect(page).not.toHaveURL(new RegExp(`/classes/${cleric.id}/`), { timeout: 10_000 });
    await page.reload();
    await expect(levelOf("Cleric Domain", 1)).toHaveAccessibleName(/3 Picks/, { timeout: 10_000 });
    await expect(levelOf("Aura (Cleric)", 5)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: `Levels of ${proficiency}` })).toHaveCount(0);
  });

  test("of an inherited cleric offers the feat pools it may give picks in, and creates a feature of its own granted at a level in one save", async ({
    page,
    ownerUser,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Pickers Fork"));
    const { items } = await parseResponse(
      apiOf(page).api.rulesets[":id"].entities[":entityType"].$get({
        param: { id: forkId, entityType: "classes" },
        query: { search: "Cleric" },
      }),
    );
    const cleric = items.find((klass) => klass.name === "Cleric")!;
    await page.goto(`/rulesets/${forkId}/classes/${cleric.id}/progression`);

    // Every feat pool but those on its card (its Cleric Domain) and the classes' feature pools, its own too
    const pools = page.getByRole("combobox", { name: "Add Feat Pool" });
    await pools.click({ timeout: 10_000 });
    await expect(page.getByRole("option", { name: "General", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Fighter Bonus Feat", exact: true })).toBeVisible();
    for (const left of ["Cleric Domain", "Cleric Class Feature", "Fighter Class Feature"])
      await expect(page.getByRole("option", { name: left, exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // A feature it doesn't have is created, named for the class, its row granted at no level until one is clicked
    const features = page.getByRole("combobox", { name: "Add Class Feature" });
    await features.fill("Hex");
    const created = apiResponse(page, "POST", /\/progression\/features$/);
    await page.getByRole("option", { name: "Create Hex (Cleric)" }).click();
    await created;
    const hexLevel = (level: number) =>
      page
        .getByRole("group", { name: "Levels of Hex (Cleric)" })
        .getByRole("button", { name: new RegExp(`^Level ${level}:`) });
    await expect(hexLevel(3)).toHaveAttribute("aria-pressed", "false");
    await hexLevel(3).click();
    const saved = apiResponse(page, "PUT", /\/entities\/classes\/[a-f0-9-]+\/progression$/);
    await page.getByRole("button", { name: "Save Progression" }).click();
    await saved;
    await page.reload();
    await expect(hexLevel(3)).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
  });
});

// A class's Spell List tab: spells added at a spell level in one save, and one removed, each written on the fork's copy
// of the inherited spell, the class itself as it was.
test.describe("A class's spell list", () => {
  test("of an inherited wizard takes two spells at a level in one save, and loses one", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Spell List Fork"));
    const { items } = await parseResponse(
      apiOf(page).api.rulesets[":id"].entities[":entityType"].$get({
        param: { id: forkId, entityType: "classes" },
        query: { search: "Wizard" },
      }),
    );
    const wizard = items.find((klass) => klass.name === "Wizard")!;

    // The tab shows its 1st-level spells, the level its add starts on
    await page.goto(`/rulesets/${forkId}/classes/${wizard.id}/spell-list?tier=1`);
    await page.getByRole("button", { name: "Add Spells" }).click();
    const add = page.getByRole("dialog", { name: "Add Spells" });
    await expect(add.getByRole("combobox", { name: "Level" })).toHaveText("Level 1");
    const picker = add.getByRole("combobox", { name: "Spells" });
    // A spell on the list already can't be picked again
    await picker.fill("Magic Missile");
    await expect(page.getByRole("option", { name: /^Magic Missile\b/ })).toBeDisabled();
    for (const name of ["Bless", "Cure Light Wounds"]) {
      await picker.fill(name);
      await page.getByRole("option", { name, exact: true }).click();
    }
    const added = apiResponse(page, "POST", /\/entities\/classes\/[a-f0-9-]+\/lists\/[a-f0-9-]+$/);
    await add.getByRole("button", { name: "Add Spells" }).click();
    await added;

    // Both are on the list at that level; one removed is gone after a reload, the other stays
    const search = page.getByPlaceholder("Search spells…");
    await search.fill("Bless");
    const bless = page.getByRole("row", { name: /^Bless\b/ });
    await expect(bless).toBeVisible({ timeout: 10_000 });
    await bless.hover();
    await bless.getByRole("button", { name: "Remove" }).click();
    const removed = apiResponse(page, "DELETE", /\/entities\/classes\/[a-f0-9-]+\/lists\/[a-f0-9-]+\/[a-f0-9-]+$/);
    // The add copied Bless into the fork: Local Changes can restore the removal
    const remove = page.getByRole("dialog", { name: "Remove Spell" });
    await expect(remove).toContainText("You can restore it from Local Changes.");
    await remove.getByRole("button", { name: "Remove Spell" }).click();
    await removed;
    await page.reload();
    await expect(page.getByRole("row", { name: /^Bless\b/ })).toHaveCount(0, { timeout: 10_000 });
    await search.fill("Cure Light Wounds");
    await expect(page.getByRole("row", { name: /^Cure Light Wounds\b/ })).toBeVisible({ timeout: 10_000 });
  });

  test("of a new class with none yet is made by its first add, with the spells picked", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("New List Fork"));
    const name = uniqueName("Witch");
    const witch = await parseResponse(
      apiOf(page).api.rulesets[":id"].entities[":entityType"].$post({
        param: { id: forkId, entityType: "classes" },
        json: { name },
      }),
    );

    await page.goto(`/rulesets/${forkId}/classes/${witch.id}/spell-list?tier=1`);
    await page.getByRole("button", { name: "Add Spells" }).click();
    const add = page.getByRole("dialog", { name: "Add Spells" });
    await expect(add).toContainText(`${name} Spells, a new list for ${name}`);
    await add.getByRole("combobox", { name: "Spells" }).fill("Bless");
    await page.getByRole("option", { name: "Bless", exact: true }).click();
    const added = apiResponse(page, "POST", /\/entities\/classes\/[a-f0-9-]+\/lists$/);
    await add.getByRole("button", { name: "Add Spells" }).click();
    await added;
    await expect(page.getByRole("row", { name: /^Bless\b/ })).toBeVisible({ timeout: 10_000 });
  });
});
