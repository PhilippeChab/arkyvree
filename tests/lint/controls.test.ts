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

  test("a chip is one of the family, and never an action: a fixed label's click, nor one that opens something but a count's", async () => {
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
          "client/src/fixedCount.tsx": 'export const f = <CountChip label="3" onClick={openMenu} />;\n',
          "client/src/step.tsx": "export const s = <ValueChip label={segment} onClick={() => goTo(index)} />;\n",
          "client/src/choice.tsx": 'export const c = <ChoiceChip label="All" selected onClick={pick} />;\n',
          "client/src/pick.tsx": "export const p = <PickChip label={pick.name} onDelete={remove} />;\n",
          "client/src/pickAction.tsx": 'export const p = <PickChip label="MAX" onClick={max} />;\n',
          "client/src/components/common/Chips.tsx":
            'import { Chip } from "@mui/material";\nexport const o = <Chip label={label} size="small" />;\n',
        },
        ["chips"],
      ),
    ).toEqual([
      "chips client/src/action.tsx",
      "chips client/src/fixedCount.tsx",
      "chips client/src/opens.tsx",
      "chips client/src/pickAction.tsx",
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
});
