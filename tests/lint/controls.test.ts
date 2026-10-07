import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("control rules", () => {
  test("a destructive, caution or positive button is contained", async () => {
    expect(
      await lintRepo(
        {
          "client/src/outlined.tsx": 'export const o = <Button variant="outlined" color="warning">Leave</Button>;\n',
          "client/src/text.tsx": 'export const t = <Button color="error">Revoke Link</Button>;\n',
          "client/src/contained.tsx": 'export const c = <Button variant="contained" color="error">Delete</Button>;\n',
          "client/src/cancel.tsx": 'export const n = <Button variant="outlined" color="inherit">Cancel</Button>;\n',
          "client/src/given.tsx": "export const g = <Button color={action.color}>Go</Button>;\n",
        },
        ["button-intents"],
      ),
    ).toEqual(["button-intents client/src/outlined.tsx", "button-intents client/src/text.tsx"]);
  });

  test("an inline form's submit is a SaveButton", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": 'export const r = <Button type="submit" variant="contained">Save</Button>;\n',
          "client/src/save.tsx": "export const s = <SaveButton canSave={dirty} pending={busy} />;\n",
          "client/src/footer.tsx": 'export const f = <Button type={submit ? "submit" : "button"}>Go</Button>;\n',
          "client/src/components/common/SaveButton.tsx": 'export const b = <Button type="submit">Save</Button>;\n',
          "client/src/components/auth/AuthSubmitButton.tsx": 'export const a = <Button type="submit">Go</Button>;\n',
        },
        ["save-buttons"],
      ),
    ).toEqual(["save-buttons client/src/raw.tsx"]);
  });

  test("a roll of every die is a labelled RollAllButton", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bare.tsx":
            'export const b = <IconButton aria-label="Roll All Ability Scores" onClick={roll}><CasinoIcon /></IconButton>;\n',
          "client/src/one.tsx":
            'export const o = <IconButton aria-label="Roll d8" onClick={roll}><CasinoIcon /></IconButton>;\n',
          "client/src/labelled.tsx": "export const l = <RollAllButton onClick={roll} />;\n",
        },
        ["roll-buttons"],
      ),
    ).toEqual(["roll-buttons client/src/bare.tsx"]);
  });

  test("a page header's action is a PageActionButton", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx":
            'export const r = <PageHeader title="T" subtitle="S" action={<Button variant="outlined">Mark All as Read</Button>} />;\n',
          "client/src/shared.tsx":
            'export const s = <PageHeader title="T" subtitle="S" action={<PageActionButton label="Create" onClick={go} />} />;\n',
          "client/src/called.tsx":
            'export const c = <PageHeader title="T" subtitle="S" action={createButton("Create")} />;\n',
        },
        ["page-actions"],
      ),
    ).toEqual(["page-actions client/src/raw.tsx"]);
  });

  test("a list's next page loads through a LoadMoreButton, labelled one way", async () => {
    expect(
      await lintRepo(
        {
          "client/src/hand.tsx": 'export const h = <Button size="small" onClick={next}>Load More</Button>;\n',
          "client/src/spinner.tsx":
            'export const s = <Button onClick={next}><DiceSpinner size="small" loading={busy}>Load More</DiceSpinner></Button>;\n',
          "client/src/label.tsx": 'export const l = <Foot label="Load More Characters" />;\n',
          "client/src/shared.tsx":
            "export const s = <LoadMoreButton hasNextPage isFetchingNextPage={busy} onClick={next} />;\n",
          "client/src/components/common/LoadMoreButton.tsx": "export const b = <Button>Load More</Button>;\n",
        },
        ["load-more-buttons"],
      ),
    ).toEqual([
      "load-more-buttons client/src/hand.tsx",
      "load-more-buttons client/src/label.tsx",
      "load-more-buttons client/src/spinner.tsx",
    ]);
  });

  test("a chip is one of the family, and never an action", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx":
            'import { Chip, Stack } from "@mui/material";\nexport const r = <Chip label={player.role} size="small" />;\n',
          "client/src/renamed.tsx":
            'import { Chip as Tag } from "@mui/material";\nexport const t = <Tag label="A" />;\n',
          "client/src/typed.tsx": 'import { type ChipProps } from "@mui/material";\nexport type T = ChipProps;\n',
          "client/src/family.tsx": "export const f = <RoleChip label={player.role} />;\n",
          "client/src/action.tsx": 'export const a = <ValueChip label="MAX" onClick={max} />;\n',
          "client/src/opens.tsx": "export const o = <ValueChip label={visibility} onClick={openMenu} />;\n",
          "client/src/choice.tsx": 'export const c = <ChoiceChip label="All" selected onClick={pick} />;\n',
          "client/src/components/common/Chips.tsx":
            'import { Chip } from "@mui/material";\nexport const o = <Chip label={label} size="small" />;\n',
          "client/src/components/common/ChoiceChip.tsx":
            'import { Chip } from "@mui/material";\nexport const c = <Chip label={label} />;\n',
        },
        ["chips"],
      ),
    ).toEqual(["chips client/src/action.tsx", "chips client/src/raw.tsx", "chips client/src/renamed.tsx"]);
  });

  test("help is a HelpLabel wherever it's given", async () => {
    expect(
      await lintRepo(
        {
          "client/src/icon.tsx":
            "export const i = <Tooltip title={help}><HelpIcon sx={{ fontSize: 18 }} /></Tooltip>;\n",
          "client/src/caption.tsx": 'export const c = <Typography variant="caption">What\'s this?</Typography>;\n',
          "client/src/link.tsx": "export const l = <ListItemIcon><HelpIcon /></ListItemIcon>;\n",
          "client/src/label.tsx": 'export const b = <HelpLabel label="Template" help={help} />;\n',
          "client/src/components/common/HelpLabel.tsx":
            "export const h = <Tooltip title={help}><HelpIcon /></Tooltip>;\n",
        },
        ["help-labels"],
      ),
    ).toEqual(["help-labels client/src/caption.tsx", "help-labels client/src/icon.tsx"]);
  });
});
