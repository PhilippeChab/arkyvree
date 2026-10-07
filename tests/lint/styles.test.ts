import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("style rules", () => {
  test("a style is written with sx: no styled(), no stylesheet but the fonts, style only passed on", async () => {
    expect(
      await lintRepo(
        {
          "client/src/sx.tsx": "export const s = <Box sx={{ p: 1 }} />;\n",
          "client/src/styled.ts": 'import { styled } from "@mui/material";\nexport const S = styled("div")({});\n',
          "client/src/sheet.ts": 'import "./a.css";\n',
          "client/src/main.tsx": 'import "@fontsource-variable/lora/wght-italic.css";\n',
          "client/src/style.tsx": "export const t = <div style={{ width: 80 }} />;\n",
          "client/src/col.tsx": "export const c = <col style={{ width: 80 }} />;\n",
          "client/src/passed.tsx":
            'export const p = <li {...props} style={{ ...props.style, pointerEvents: "auto" }} />;\n',
        },
        ["sx-styles"],
      ),
    ).toEqual([
      "sx-styles client/src/col.tsx",
      "sx-styles client/src/sheet.ts",
      "sx-styles client/src/style.tsx",
      "sx-styles client/src/styled.ts",
    ]);
  });

  test("a color is the theme's: a palette token, translucent through alpha()", async () => {
    expect(
      await lintRepo(
        {
          "client/src/token.tsx":
            'export const t = <Box sx={{ color: "common.white", bgcolor: (theme) => alpha(theme.palette.common.black, 0.5) }} />;\n',
          "client/src/hex.tsx": 'export const h = <Box sx={{ color: "#fff" }} />;\n',
          "client/src/rgba.tsx": 'export const r = <Box sx={{ bgcolor: "rgba(0,0,0,0.5)" }} />;\n',
          "client/src/named.tsx": 'export const n = <Box sx={{ color: "white" }} />;\n',
          "client/src/prop.tsx": 'export const p = <Typography color="white" />;\n',
          "client/src/palette.tsx": 'export const q = <Typography color="secondary" />;\n',
          "client/src/suffix.tsx":
            "export const s = <Box sx={{ bgcolor: (theme) => `${theme.palette.primary.main}40` }} />;\n",
          "client/src/link.tsx": 'export const l = <a href="#top" />;\n',
          "client/src/theme/palette.ts": 'export const PALETTE = { main: "#8d1e1e" };\n',
        },
        ["theme-colors"],
      ),
    ).toEqual([
      "theme-colors client/src/hex.tsx",
      "theme-colors client/src/named.tsx",
      "theme-colors client/src/prop.tsx",
      "theme-colors client/src/rgba.tsx",
      "theme-colors client/src/suffix.tsx",
    ]);
  });

  test("a shadow is an elevation or one the theme names", async () => {
    expect(
      await lintRepo(
        {
          "client/src/named.tsx": "export const n = <Box sx={{ boxShadow: (theme) => theme.boxShadows.banner }} />;\n",
          "client/src/elevation.tsx": 'export const e = <Box sx={{ boxShadow: 2, textShadow: "none" }} />;\n',
          "client/src/box.tsx": 'export const b = <Box sx={{ boxShadow: "0 2px 4px black" }} />;\n',
          "client/src/text.tsx":
            "export const t = <Box sx={{ textShadow: (theme) => `0 1px 2px ${theme.palette.common.black}` }} />;\n",
          "client/src/drop.tsx": 'export const d = <Box sx={{ filter: "drop-shadow(0 2px 4px black)" }} />;\n',
          "client/src/grey.tsx": 'export const g = <Box sx={{ filter: "grayscale(0.3)" }} />;\n',
        },
        ["shadows"],
      ),
    ).toEqual(["shadows client/src/box.tsx", "shadows client/src/drop.tsx", "shadows client/src/text.tsx"]);
  });

  test("a corner is in the theme's units, spacing too, and a layer is the theme's", async () => {
    expect(
      await lintRepo(
        {
          "client/src/units.tsx":
            'export const u = <Box sx={{ borderRadius: 1, borderBottomLeftRadius: 0, p: 1.5, zIndex: 1, mt: "auto" }} />;\n',
          "client/src/circle.tsx": 'export const c = <Box sx={{ borderRadius: "50%" }} />;\n',
          "client/src/radius.tsx": 'export const r = <Box sx={{ borderRadius: "8px 8px 0 0" }} />;\n',
          "client/src/corner.tsx": "export const k = <Box sx={{ borderTopLeftRadius: 4 }} />;\n",
          "client/src/pixels.tsx": 'export const p = <Box sx={{ py: "12px" }} />;\n',
          "client/src/layer.tsx": "export const l = <Box sx={{ zIndex: 1300 }} />;\n",
        },
        ["shape"],
      ),
    ).toEqual([
      "shape client/src/corner.tsx",
      "shape client/src/layer.tsx",
      "shape client/src/pixels.tsx",
      "shape client/src/radius.tsx",
    ]);
  });

  test("a border is the theme's shorthand, its color and style apart", async () => {
    expect(
      await lintRepo(
        {
          "client/src/shorthand.tsx":
            'export const s = <Box sx={{ border: 1, borderColor: "divider", borderLeft: "none" }} />;\n',
          "client/src/written.tsx": 'export const w = <Box sx={{ border: "1px solid" }} />;\n',
          "client/src/template.tsx":
            "export const t = <Box sx={{ borderTop: (theme) => `2px solid ${theme.palette.divider}` }} />;\n",
        },
        ["borders"],
      ),
    ).toEqual(["borders client/src/template.tsx", "borders client/src/written.tsx"]);
  });

  test("motion is timed by the theme's tokens, and what moves stops for less motion", async () => {
    expect(
      await lintRepo(
        {
          "client/src/tokens.tsx":
            'export const t = <Box sx={{ transition: transitionOf(["opacity"], DURATION.fast), animation: `${fadeIn} ${DURATION.normal}ms ${EASING.easeIn}`, [PREFERS_REDUCED_MOTION]: { animation: "none" } }} />;\n',
          "client/src/literal.tsx": 'export const l = <Box sx={{ transition: "opacity 0.2s ease" }} />;\n',
          "client/src/keyframes.ts": 'import { keyframes } from "@mui/material";\nexport const K = keyframes``;\n',
          "client/src/timeout.tsx": "export const c = <Collapse in timeout={250} />;\n",
          "client/src/still.tsx": 'export const s = <Box sx={{ "&:hover": { transform: "scale(1.1)" } }} />;\n',
          "client/src/stilled.tsx":
            'export const d = <Box sx={{ "&:hover": { transform: "scale(1.1)" }, [PREFERS_REDUCED_MOTION]: { "&:hover": { transform: "none" } } }} />;\n',
          "client/src/theme/animations.ts": 'export const EASING = { standard: "cubic-bezier(0.4, 0, 0.2, 1)" };\n',
        },
        ["motion"],
      ),
    ).toEqual([
      "motion client/src/keyframes.ts",
      "motion client/src/literal.tsx",
      "motion client/src/still.tsx",
      "motion client/src/timeout.tsx",
    ]);
  });

  test("text takes its style from a variant, a weight is a number, an icon takes MUI's sizes as its prop", async () => {
    expect(
      await lintRepo(
        {
          "client/src/variant.tsx":
            'export const v = <Typography variant="body2" sx={{ fontWeight: 600, typography: { xs: "body1", sm: "h6" }, fontSize: "0.75rem" }} />;\n',
          "client/src/fixed.tsx": 'export const f = <Typography sx={{ typography: "body1" }} />;\n',
          "client/src/bold.tsx": 'export const b = <Typography sx={{ fontWeight: "bold" }} />;\n',
          "client/src/align.tsx": 'export const a = <Typography align="center" />;\n',
          "client/src/pixels.tsx": "export const p = <Typography sx={{ fontSize: 14 }} />;\n",
          "client/src/icon.tsx": "export const i = <AddIcon sx={{ fontSize: 20 }} />;\n",
          "client/src/sized.tsx": "export const s = <AddIcon sx={{ fontSize: 14 }} />;\n",
          "client/src/clamp.tsx": "export const c = <Typography sx={{ WebkitLineClamp: 2 }} />;\n",
        },
        ["type-scale"],
      ),
    ).toEqual([
      "type-scale client/src/align.tsx",
      "type-scale client/src/bold.tsx",
      "type-scale client/src/clamp.tsx",
      "type-scale client/src/fixed.tsx",
      "type-scale client/src/icon.tsx",
      "type-scale client/src/pixels.tsx",
    ]);
  });

  test("a heading-sized Typography declares its element", async () => {
    expect(
      await lintRepo(
        {
          "client/src/declared.tsx": 'export const d = <Typography variant="h6" component="h2" />;\n',
          "client/src/body.tsx": 'export const b = <Typography variant="body2" />;\n',
          "client/src/variant.tsx": 'export const v = <Typography variant="subtitle1" />;\n',
          "client/src/responsive.tsx": 'export const r = <Typography sx={{ typography: { xs: "h6", sm: "h5" } }} />;\n',
        },
        ["headings"],
      ),
    ).toEqual(["headings client/src/responsive.tsx", "headings client/src/variant.tsx"]);
  });

  test("a flex container is a Stack, a grid a Box, an element a Box or a Typography, a spacer flexGrow", async () => {
    expect(
      await lintRepo(
        {
          "client/src/stack.tsx":
            'export const s = <Stack direction="row" spacing={1} sx={{ display: { xs: "none", sm: "flex" } }}><Box sx={{ display: "grid" }} /><Box sx={{ flexGrow: 1 }} /></Stack>;\n',
          "client/src/flex.tsx": 'export const f = <Box sx={{ display: "flex" }} />;\n',
          "client/src/gap.tsx": "export const g = <Stack sx={{ gap: 1 }} />;\n",
          "client/src/constant.ts": 'export const ROW_SX = { display: "flex" };\n',
          "client/src/grid.ts": 'import { Grid } from "@mui/material";\nexport const G = Grid;\n',
          "client/src/div.tsx": "export const d = <div />;\n",
          "client/src/spacer.tsx": "export const p = <Box sx={{ flex: 1 }} />;\n",
        },
        ["flex-layout"],
      ),
    ).toEqual([
      "flex-layout client/src/constant.ts",
      "flex-layout client/src/div.tsx",
      "flex-layout client/src/flex.tsx",
      "flex-layout client/src/gap.tsx",
      "flex-layout client/src/grid.ts",
      "flex-layout client/src/spacer.tsx",
    ]);
  });

  test("a margin only aligns, resets or bleeds", async () => {
    expect(
      await lintRepo(
        {
          "client/src/aligns.tsx":
            'export const a = <Box sx={{ mx: "auto", mt: 0, ml: { xs: 0, sm: "auto" }, mb: -2 }} />;\n',
          "client/src/gap.tsx": "export const g = <Box sx={{ mb: 2 }} />;\n",
          "client/src/longhand.tsx": "export const l = <Box sx={{ marginTop: 1 }} />;\n",
          "client/src/written.tsx": 'export const w = <Box sx={{ m: "0 auto" }} />;\n',
          "client/src/constant.ts": "export const ROW_SX = { mt: 1 };\n",
          "client/src/field.tsx": 'export const f = <TextField margin="normal" />;\n',
          "client/src/none.tsx": 'export const n = <TextField margin="none" />;\n',
        },
        ["spacing"],
      ),
    ).toEqual([
      "spacing client/src/constant.ts",
      "spacing client/src/field.tsx",
      "spacing client/src/gap.tsx",
      "spacing client/src/longhand.tsx",
      "spacing client/src/written.tsx",
    ]);
  });

  test("sx is written one way", async () => {
    expect(
      await lintRepo(
        {
          "client/src/array.tsx":
            'export const a = <Box sx={[{ p: 1, color: (theme) => (open ? theme.palette.primary.main : undefined) }, open && { bgcolor: "action.hover" }, ...(Array.isArray(sx) ? sx : [sx])]} />;\n',
          "client/src/longhand.tsx": 'export const l = <Box sx={{ backgroundColor: "action.hover" }} />;\n',
          "client/src/spread.tsx": "export const s = <Box sx={{ p: 1, ...(open && { m: 0 }) }} />;\n",
          "client/src/caller.tsx": "export const c = <Box sx={{ p: 1, ...sx }} />;\n",
          "client/src/empty.tsx": 'export const e = <Box sx={{ "&:hover": open ? { opacity: 1 } : {} }} />;\n',
          "client/src/slot.tsx":
            "export const t = <Tooltip slotProps={{ tooltip: { sx: open ? { maxWidth: 500 } : {} } }} />;\n",
          "client/src/callback.tsx":
            "export const f = <Box sx={(theme) => ({ color: theme.palette.primary.main })} />;\n",
          "client/src/important.tsx": 'export const i = <Box sx={{ bottom: "12px !important" }} />;\n',
          "client/src/frame.tsx": 'export const r = <Box sx={{ "& iframe": { width: "100% !important" } }} />;\n',
          "client/src/hook.ts": 'import { useTheme } from "@mui/material";\nexport const h = useTheme;\n',
          "client/src/hooks/useIsMobile.ts":
            'import { useMediaQuery } from "@mui/material";\nexport const m = useMediaQuery;\n',
          "client/src/mode.tsx": 'const darkMode = theme.palette.mode === "dark";\nexport const d = darkMode;\n',
          "client/src/param.tsx": "export const t = <Box sx={{ zIndex: (t) => t.zIndex.drawer + 1 }} />;\n",
          "client/src/named.tsx": "export const n = <Box sx={[ROW_SX, open && OPEN_STYLE]} />;\n",
        },
        ["sx-conventions"],
      ),
    ).toEqual([
      "sx-conventions client/src/callback.tsx",
      "sx-conventions client/src/caller.tsx",
      "sx-conventions client/src/empty.tsx",
      "sx-conventions client/src/hook.ts",
      "sx-conventions client/src/important.tsx",
      "sx-conventions client/src/longhand.tsx",
      "sx-conventions client/src/mode.tsx",
      "sx-conventions client/src/named.tsx",
      "sx-conventions client/src/param.tsx",
      "sx-conventions client/src/slot.tsx",
      "sx-conventions client/src/spread.tsx",
    ]);
  });
});
