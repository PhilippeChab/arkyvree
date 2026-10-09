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

  test("a menu's item or a row's action that deletes or removes is destructive", async () => {
    expect(
      await lintRepo(
        {
          "client/src/menu.tsx": 'export const m = <ActionMenuItem icon={DeleteIcon} label="Remove Level" />;\n',
          "client/src/row.tsx": 'export const r = <RowAction icon={DeleteIcon} label="Delete" />;\n',
          "client/src/either.tsx":
            'export const e = <ActionMenuItem label={restorable ? "Delete" : "Delete Permanently"} intent="destructive" />;\n',
          "client/src/leave.tsx":
            'export const l = <RowAction label={self ? "Leave" : "Remove"} intent={self ? "caution" : "destructive"} />;\n',
          "client/src/edit.tsx": 'export const d = <RowAction icon={EditIcon} label="Edit" />;\n',
        },
        ["button-intents"],
      ),
    ).toEqual(["button-intents client/src/menu.tsx", "button-intents client/src/row.tsx"]);
  });

  test("an inline form's submit is a SaveButton", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": 'export const r = <Button type="submit" variant="contained">Save</Button>;\n',
          "client/src/save.tsx": "export const s = <SaveButton canSave={dirty} pending={busy} />;\n",
          "client/src/footer.tsx": 'export const f = <Button type={submit ? "submit" : "button"}>Go</Button>;\n',
          "client/src/components/common/SaveButton.tsx": 'export const b = <Button type="submit">Save</Button>;\n',
          "client/src/pages/auth/components/AuthSubmitButton.tsx":
            'export const a = <Button type="submit">Go</Button>;\n',
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

  test("a roll shows through useDiceRoll, never a timer of its own", async () => {
    expect(
      await lintRepo(
        {
          "client/src/die.ts": "export const d = () => setInterval(() => setFace(rollDie(6)), 50);\n",
          "client/src/random.ts":
            "export const r = () => setInterval(() => setFace(Math.floor(Math.random() * 16) + 3), 50);\n",
          "client/src/method.ts": "export const m = () => setTimeout(function () { land(rollScore()); }, 800);\n",
          "client/src/click.ts": "export const c = () => setHp(rollDie(8));\n",
          "client/src/bell.ts": "export const b = () => setTimeout(() => setShake(false), 600);\n",
          "client/src/pages/characters/useDiceRoll.ts":
            "export const o = () => setInterval(() => setFace(die.roll()), DICE_ROLL.face);\n",
        },
        ["dice-rolls"],
      ),
    ).toEqual(["dice-rolls client/src/die.ts", "dice-rolls client/src/method.ts", "dice-rolls client/src/random.ts"]);
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

  test("a chip is one of the family, and never an action: a fixed label's click, nor one that opens something", async () => {
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
          "client/src/popover.tsx": "export const p = <CountChip label={count} onClick={() => setListOpen(true)} />;\n",
          "client/src/step.tsx": "export const s = <ValueChip label={segment} onClick={() => goTo(index)} />;\n",
          "client/src/choice.tsx": 'export const c = <ChoiceChip label="All" selected onClick={pick} />;\n',
          "client/src/components/common/Chips.tsx":
            'import { Chip } from "@mui/material";\nexport const o = <Chip label={label} size="small" />;\n',
        },
        ["chips"],
      ),
    ).toEqual([
      "chips client/src/action.tsx",
      "chips client/src/opens.tsx",
      "chips client/src/popover.tsx",
      "chips client/src/raw.tsx",
      "chips client/src/renamed.tsx",
    ]);
  });

  test("a chip that names a record links through its to, never a link in its label", async () => {
    expect(
      await lintRepo(
        {
          "client/src/muiLink.tsx":
            "export const m = <ValueChip label={to ? <MuiLink component={Link} to={to}>{name}</MuiLink> : name} />;\n",
          "client/src/routerLink.tsx": "export const r = <StatusChip label={<><Link to={to}>{name}</Link> 3</>} />;\n",
          "client/src/madeLink.tsx":
            "export const l = <CountChip label={<Typography component={Link} to={to} />} />;\n",
          "client/src/to.tsx": "export const t = <ValueChip label={name} to={to} />;\n",
          "client/src/text.tsx": "export const x = <ValueChip label={<Typography>{name}</Typography>} />;\n",
          "client/src/tooltip.tsx":
            "export const p = <Tooltip title={<MuiLink href={href}>Help</MuiLink>}><ValueChip label={name} /></Tooltip>;\n",
        },
        ["chips"],
      ),
    ).toEqual(["chips client/src/madeLink.tsx", "chips client/src/muiLink.tsx", "chips client/src/routerLink.tsx"]);
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
