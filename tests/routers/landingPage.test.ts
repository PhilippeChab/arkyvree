/**
 * The landing page (`server/landing.html`) is plain HTML the static router serves, out of the client's lint: it keeps
 * the app's look by its own tokens, which these checks hold to the app's theme, and the app's scales by its styles.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { DURATION, EASING } from "@/client/src/lib/animations.ts";
import { containedBorderColor, containedGradient, createAppTheme } from "@/client/src/theme/appTheme.ts";
import { brandGold, brandGoldTint } from "@/client/src/theme/brandGold.ts";
import { glow, iconGlow, textLift } from "@/client/src/theme/shadows.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** The motion tokens' durations, which a transition or an animation takes */
const DURATIONS = new Set<number>([DURATION.fast, DURATION.normal, DURATION.slow]);

/** The typography variants whose sizes and weights the page's text takes */
const VARIANTS = ["h1", "h2", "h3", "h4", "h5", "h6", "subtitle1", "subtitle2", "body1", "body2", "button"] as const;

/** A color written out: a hex color, or an `rgb()` / `hsl()` */
const WRITTEN_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;

/** The page's style, its tokens' blocks apart: the declarations after them */
function declarations() {
  const style = styleOf();
  const rules = style.slice(style.indexOf("html { scroll-behavior"));
  return [...rules.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map(([, property, value]) => ({ property, value }));
}

/** The theme's tokens the page writes out, for a mode */
function expectedTokens(darkMode: boolean) {
  const theme = createAppTheme(darkMode);
  const appBar = theme.components?.MuiAppBar?.styleOverrides?.root;
  const gradient = containedGradient("primary", darkMode);
  return {
    "--bg-default": theme.palette.background.default,
    "--bg-paper": theme.palette.background.paper,
    "--text-primary": theme.palette.text.primary,
    "--text-secondary": theme.palette.text.secondary,
    "--primary": theme.palette.primary.main,
    "--secondary": theme.palette.secondary.main,
    "--gold": brandGold(darkMode),
    // The sign-in page's glow behind its logo
    "--gold-faint": brandGoldTint(darkMode, darkMode ? 0.12 : 0.1),
    "--divider": theme.palette.divider,
    "--common-white": theme.palette.common.white,
    "--common-black": theme.palette.common.black,
    "--backdrop-top": theme.palette.backdrop.top,
    "--backdrop-middle": theme.palette.backdrop.middle,
    "--backdrop-bottom": theme.palette.backdrop.bottom,
    "--appbar-bg": isRecord(appBar) ? String(appBar.background) : "",
    "--appbar-shadow": isRecord(appBar) ? String(appBar.boxShadow) : "",
    "--button-border": containedBorderColor("primary", darkMode),
    "--button-contained-bg": gradient.background,
    "--button-contained-hover": gradient.hover,
    "--button-contained-text": theme.palette.primary.contrastText,
    "--button-glow": glow(theme.palette.primary.main),
    "--logo-glow": iconGlow(brandGold(false)),
    "--text-lift": textLift(theme),
  };
}

/** The page's own style block, after its fonts' */
function styleOf() {
  const html = readFileSync("server/landing.html", "utf8");
  return html.slice(html.indexOf("*, *::before, *::after"), html.indexOf("</style>", html.indexOf("*, *::before")));
}

/** The custom properties a block of the page's style declares (`:root`, `html.light`) */
function tokensOf(selector: string) {
  const style = styleOf();
  const start = style.indexOf(`${selector} {`);
  const block = style.slice(start, style.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value]));
}

describe("landing page", () => {
  test("its tokens are the app theme's, on both themes", () => {
    const dark = tokensOf(":root");
    const light = { ...dark, ...tokensOf("html.light") };
    for (const [mode, tokens] of [
      [true, dark],
      [false, light],
    ] as const) {
      const expected = expectedTokens(mode);
      const written = Object.fromEntries(Object.keys(expected).map((name) => [name, tokens[name]]));
      expect(written).toEqual(expected);
    }
  });

  test("its styles keep to the theme's scales: no color, size, weight or timing of their own", () => {
    const theme = createAppTheme(true);
    const sizes = new Set([...VARIANTS.map((v) => String(theme.typography[v].fontSize)), theme.typography.pxToRem(15)]);
    const weights = new Set(VARIANTS.map((v) => String(theme.typography[v].fontWeight)));
    const easings = new Set(
      Object.values(EASING).map((e) => e.replace(/\s/g, "").replace(/\.0\b|(\d)\.0(?=[,)])/g, "$1")),
    );
    const offScale: string[] = [];
    for (const { property, value } of declarations()) {
      const off = (why: string) => offScale.push(`${property}: ${value} (${why})`);
      if (WRITTEN_COLOR.test(value)) off("a color, which is a token");
      if (property === "letter-spacing" || value.includes("!important")) off("the theme sets none");
      if (property === "font-size" && !sizes.has(value.trim())) off("a size no variant has");
      if (property === "font-weight" && !weights.has(value.trim())) off("a weight no variant has");
      for (const [, px] of value.matchAll(/(\d+(?:\.\d+)?)px/g)) {
        if (Number(px) > 2 && Number(px) % 4 !== 0) off("off the 4px grid");
      }
      for (const [, ms] of value.matchAll(/(\d+)ms/g)) {
        const time = Number(ms);
        const timed = DURATIONS.has(time) || time % DURATION.stagger === 0;
        if (!timed) off("a time no token gives");
      }
      for (const [easing] of value.matchAll(/cubic-bezier\([^)]*\)/g)) {
        const normalized = easing.replace(/\s/g, "").replace(/\.0\b|(\d)\.0(?=[,)])/g, "$1");
        if (!easings.has(normalized)) off("an easing no token gives");
      }
    }
    expect(offScale).toEqual([]);
  });

  test("its markup has no inline style, hides its decorations and outlines its headings", () => {
    const html = readFileSync("server/landing.html", "utf8");
    const body = html.slice(html.indexOf("<body>"));
    expect(body).not.toContain(" style=");
    expect([...body.matchAll(/<svg\b[^>]*>/g)].filter(([svg]) => !svg.includes('aria-hidden="true"'))).toEqual([]);
    expect([...body.matchAll(/<img\b[^>]*>/g)].filter(([img]) => !/\balt="/.test(img))).toEqual([]);
    const levels = [...body.matchAll(/<h([1-6])\b/g)].map(([, level]) => Number(level));
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels.filter((level, i) => i > 0 && level > levels[i - 1] + 1)).toEqual([]);
  });
});
