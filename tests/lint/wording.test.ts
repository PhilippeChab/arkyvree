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
          "client/src/dialog.tsx": 'export const d = <DeleteDialog title="Delete permanently" />;\n',
          "client/src/tooltip.tsx":
            'export const t = <Tooltip title="Edit role"><IconButton aria-label="Edit Role" /></Tooltip>;\n',
          "client/src/described.tsx":
            'export const d = <Tooltip describeChild title="Searching this level only"><IconButton aria-label="Search Everywhere" /></Tooltip>;\n',
          "client/src/aria.tsx": 'export const a = <IconButton aria-label="More actions" />;\n',
          "client/src/die.tsx": "export const r = <IconButton aria-label={`Roll d${hd}`} />;\n",
          "client/src/text.tsx": "export const p = <Typography>Notifications from your campaigns</Typography>;\n",
        },
        ["label-case"],
      ),
    ).toEqual([
      "label-case client/src/aria.tsx",
      "label-case client/src/button.tsx",
      "label-case client/src/dialog.tsx",
      "label-case client/src/field.tsx",
      "label-case client/src/spinner.tsx",
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
          "client/src/fallback.ts": 'snackbar.error(error, "Failed to remove item");\n',
          "client/src/unnamed.ts": 'snackbar.error(error, "Something went wrong");\n',
        },
        ["toast-wording"],
      ),
    ).toEqual([
      "toast-wording client/src/period.ts",
      "toast-wording client/src/please.ts",
      "toast-wording client/src/successfully.ts",
      "toast-wording client/src/unnamed.ts",
    ]);
  });

  test("a confirmation asks, and a deletion says it can't be undone", async () => {
    expect(
      await lintRepo(
        {
          "client/src/asks.tsx":
            'export const a = <ConfirmDialog message="Are you sure you want to archive this campaign? You can restore it later." />;\n',
          "client/src/says.tsx": 'export const s = <ConfirmDialog message="This may break prerequisites." />;\n',
          "client/src/delete.tsx":
            'export const d = <DeleteDialog message="Are you sure you want to delete this modifier? This action cannot be undone." />;\n',
          "client/src/undone.tsx":
            'export const u = <DeleteDialog message="Are you sure you want to delete this modifier?" />;\n',
        },
        ["confirm-wording"],
      ),
    ).toEqual(["confirm-wording client/src/says.tsx", "confirm-wording client/src/undone.tsx"]);
  });

  test("an ellipsis is one mark, a dash between words an em dash, and a cut text truncate()", async () => {
    expect(
      await lintRepo(
        {
          "client/src/dots.tsx": 'export const d = <TextField placeholder="Search races..." />;\n',
          "client/src/mark.tsx": 'export const m = <TextField placeholder="Search races…" />;\n',
          "client/src/spread.tsx": "export const s = <Box {...props} />;\n",
          "client/src/dash.tsx": "export const h = <Typography>Level 3 - Requirements not met</Typography>;\n",
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
    ]);
  });
});
