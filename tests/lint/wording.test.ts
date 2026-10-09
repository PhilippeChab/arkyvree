import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("wording rules", () => {
  test("a label is in Title Case", async () => {
    expect(
      await lintRepo(
        {
          "client/src/button.tsx": "export const b = <Button>Mark all read</Button>;\n",
          "client/src/titled.tsx": "export const t = <Button>Mark All as Read</Button>;\n",
          "client/src/spinner.tsx":
            'export const s = <Button><DiceSpinner loading={busy} size="small">Save changes</DiceSpinner></Button>;\n',
          "client/src/field.tsx": 'export const f = <TextField label="Email address" />;\n',
          "client/src/toggle.tsx": 'export const t = <OptionToggle label="Publish kind" />;\n',
          "client/src/dialog.tsx": 'export const d = <DeleteDialog title="Delete permanently" />;\n',
          "client/src/tooltip.tsx":
            'export const t = <Tooltip title="Edit role"><IconButton aria-label="Edit Role" /></Tooltip>;\n',
          "client/src/described.tsx":
            'export const d = <Tooltip describeChild title="Searching this level only"><IconButton aria-label="Search Everywhere" /></Tooltip>;\n',
          "client/src/aria.tsx": 'export const a = <IconButton aria-label="More actions" />;\n',
          "client/src/die.tsx": "export const r = <IconButton aria-label={`Roll d${hd}`} />;\n",
          "client/src/text.tsx": "export const p = <Typography>Notifications from your campaigns</Typography>;\n",
          "client/src/component.tsx": 'export const c = <TargetPathInput label="Pick a path to insert" />;\n',
          "client/src/sheet.tsx": 'export const t = <SheetSection title="Combat & Saves" />;\n',
          "client/src/section.tsx": 'export const s = <ProfileCard title="Linked accounts" />;\n',
          "client/src/chip.tsx": 'export const c = <StatusChip label="modified" />;\n',
          "client/src/empty.tsx": 'export const e = <BlankState title="No feats yet" />;\n',
          "client/src/alert.tsx": 'export const a = <ValidationIssuesAlert title="Validation warnings" />;\n',
          "client/src/page.tsx": 'usePageTitle("Demo expired");\n',
          "client/src/named.tsx": 'usePageTitle("Demo Expired");\n',
        },
        ["label-case"],
      ),
    ).toEqual([
      "label-case client/src/alert.tsx",
      "label-case client/src/aria.tsx",
      "label-case client/src/button.tsx",
      "label-case client/src/component.tsx",
      "label-case client/src/dialog.tsx",
      "label-case client/src/field.tsx",
      "label-case client/src/page.tsx",
      "label-case client/src/section.tsx",
      "label-case client/src/spinner.tsx",
      "label-case client/src/toggle.tsx",
      "label-case client/src/tooltip.tsx",
    ]);
  });

  test("a toast is a phrase, and an error's fallback names what failed", async () => {
    expect(
      await lintRepo(
        {
          "client/src/done.ts": 'snackbar.success("Ruleset archived");\n',
          "client/src/successfully.ts": 'snackbar.success("Ruleset archived successfully");\n',
          "client/src/period.ts": 'snackbar.info("Your PDF is being generated.");\n',
          "client/src/please.ts": 'snackbar.warning("Please wait a minute");\n',
          "client/src/kindly.ts": 'snackbar.info("Try again, please");\n',
          "client/src/you-have.ts": 'snackbar.success("You have left this character");\n',
          "client/src/invitation.ts": 'snackbar.success("Invitation revoked");\n',
          "client/src/invite.ts": 'snackbar.success("Invite revoked");\n',
          "client/src/fallback.ts": 'snackbar.error(error, "Failed to remove item");\n',
          "client/src/unnamed.ts": 'snackbar.error(error, "Something went wrong");\n',
        },
        ["toast-wording"],
      ),
    ).toEqual([
      "toast-wording client/src/invitation.ts",
      "toast-wording client/src/kindly.ts",
      "toast-wording client/src/period.ts",
      "toast-wording client/src/please.ts",
      "toast-wording client/src/successfully.ts",
      "toast-wording client/src/unnamed.ts",
      "toast-wording client/src/you-have.ts",
    ]);
  });

  test("a confirmation asks, a deletion says it can't be undone, and an archive how it comes back", async () => {
    expect(
      await lintRepo(
        {
          "client/src/asks.tsx":
            'export const a = <ConfirmDialog message="Are you sure you want to archive this campaign? You can unarchive it at any time from the Archived filter." />;\n',
          "client/src/archive.tsx":
            'export const r = <ConfirmDialog message="Are you sure you want to archive this campaign? You can restore it later." />;\n',
          "client/src/admin.tsx":
            'export const m = <ConfirmDialog message={canUnarchive ? "Are you sure you want to archive this ruleset? You can unarchive it at any time from the Archived filter." : "Are you sure you want to archive this ruleset? Only its owner can unarchive it."} />;\n',
          "client/src/says.tsx": 'export const s = <ConfirmDialog message="This may break prerequisites." />;\n',
          "client/src/delete.tsx":
            'export const d = <DeleteDialog message="Are you sure you want to delete this modifier? This action cannot be undone." />;\n',
          "client/src/undone.tsx":
            'export const u = <DeleteDialog message="Are you sure you want to delete this modifier?" />;\n',
          "client/src/restorable.tsx":
            'export const r = <DeleteDialog message={restorable ? "Are you sure you want to delete this feat? You can restore it from Local Changes." : "Are you sure you want to delete this feat? This action cannot be undone."} />;\n',
          "client/src/unsaid.tsx":
            'export const n = <DeleteDialog message={restorable ? "Are you sure you want to delete this feat?" : "Are you sure you want to delete this feat? This action cannot be undone."} />;\n',
        },
        ["confirm-wording"],
      ),
    ).toEqual([
      "confirm-wording client/src/archive.tsx",
      "confirm-wording client/src/says.tsx",
      "confirm-wording client/src/undone.tsx",
      "confirm-wording client/src/unsaid.tsx",
    ]);
  });

  test("an ellipsis is one mark, a dash between words an em dash, and a cut text truncate()", async () => {
    expect(
      await lintRepo(
        {
          "client/src/dots.tsx": 'export const d = <TextField placeholder="Search races..." />;\n',
          "client/src/mark.tsx": 'export const m = <TextField placeholder="Search races…" />;\n',
          "client/src/spread.tsx": "export const s = <Box {...props} />;\n",
          "client/src/dash.tsx": "export const h = <Typography>Level 3 - Requirements not met</Typography>;\n",
          "client/src/template.tsx": "export const p = `${pool.name} - ${level} ${picked}/${available}`;\n",
          "client/src/sum.tsx": "export const n = `${total - spent} left`;\n",
          "client/src/math.tsx": 'export const c = <Box sx={{ left: "calc(50% - 24px)" }} />;\n',
          "client/src/cut.tsx": "export const t = `${text.slice(0, 60)}…`;\n",
          "client/src/lib/truncate.ts": "export const u = `${text.slice(0, length)}…`;\n",
        },
        ["typography-marks"],
      ),
    ).toEqual([
      "typography-marks client/src/cut.tsx",
      "typography-marks client/src/dash.tsx",
      "typography-marks client/src/dots.tsx",
      "typography-marks client/src/template.tsx",
    ]);
  });
});
