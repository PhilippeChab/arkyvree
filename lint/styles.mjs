/**
 * How the client writes its styles (docs/frontend.md), as rules. Every value a style takes is the
 * theme's (`client/src/theme/`, where they're written out); everywhere else a style names one.
 *
 * - `sx-styles`: a style is written with `sx`: never `styled()`, no stylesheet but the fonts `main.tsx` loads (the
 *   page's own styles are `theme/globalStyles.ts`' `GLOBAL_STYLES`), and `style` only passes on one a component is
 *   given (`{ ...props.style, … }`). A table's column is a `Box component="col"`.
 * - `theme-colors`: a color is the theme's: a palette token (`"text.secondary"`, `theme.palette.gold.main`),
 *   translucent through `alpha()`; never a hex, `rgb()` or `hsl()` color, a CSS color name, or a hex alpha appended.
 * - `shadows`: a shadow is the theme's: an elevation (`boxShadow: 2`) or one of its named shadows
 *   (`theme.boxShadows.banner`, `theme.textShadows.hero`, `theme.dropShadows.authLogo`), never one written out.
 * - `shape`: a corner is in the theme's units (`borderRadius: 1`) or a circle (`"50%"`), and a corner of its own
 *   only drops to `0` beside it; spacing is in the theme's units (`p: 1.5`), never pixels; a layer above the page is
 *   the theme's (`theme.zIndex.drawer + 1`), a number orders siblings only (`0`, `1`).
 * - `borders`: a border is the theme's shorthand (`border: 1`, `borderLeft: 3`), its color `borderColor`, its style
 *   `borderStyle`.
 * - `motion`: motion is timed by `theme/animations.ts`: an animation it names, a transition of its `DURATION` and
 *   `EASING`; keyframes and MUI's transitions are the theme's. What moves (an animation, a transform on hover) stops
 *   for a viewer who asked for less motion (`[PREFERS_REDUCED_MOTION]`).
 * - `type-scale`: text takes its style from a variant (`variant="body2"`, a responsive one in `sx`), sized in `rem`
 *   when it sizes itself; a font weight is a number; text aligns with `textAlign`; an icon takes MUI's named sizes as
 *   its `fontSize` prop; lines clamp through `lineClampSx`.
 * - `headings`: a `Typography` sized as a heading or a subtitle declares its element (`component="h2"`, `"p"`), so the
 *   page's outline is a hierarchy.
 * - `flex-layout`: a flex container is a `Stack`, its `direction` and `spacing` props (a gap), never another element
 *   with a flex `display`; a grid is a `Box` (`display: "grid"`), never MUI's `Grid`; an element is a `Box` or a
 *   `Typography`, never a raw `div` or `p`; a spacer is `flexGrow: 1`.
 * - `spacing`: the gap between blocks is their `Stack`'s `spacing`, never a block's own margin, on any side; an
 *   indent is padding, a heading's gutter `gutterBottom`. A margin only aligns (`mx: "auto"`) or resets (`0`): nothing
 *   bleeds past its parent's padding (a wide table keeps it, and scrolls sideways).
 * - `sx-conventions`: `sx` is written one way: MUI's shorthand keys (`bgcolor`, `p`, `mt`), an object whose values
 *   may read the theme (`color: (theme) => …`), never a function of its own; a caller's `sx` and a style on a
 *   condition join it as an array (`sx={[{ … }, open && { … }, ...(Array.isArray(sx) ? sx : [sx])]}`); no `!important`. The theme's
 *   mode is branched on as `theme.palette.mode === "dark"`, in a style; MUI's `useTheme` and `useMediaQuery` are
 *   `useIsMobile`'s. The theme paints the app bar (`MuiAppBar`): an `AppBar`'s `sx` sets no background.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { elementName, hasAttribute, inClient } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** What paints a surface, which the theme does for the app bar (`MuiAppBar`) */
const BACKGROUND_KEYS = new Set(["background", "backgroundColor", "backgroundImage", "bgcolor"]);

/** The border shorthands, which the theme writes from a width (`border: 1` is `1px solid`) */
const BORDER_SIDES = new Set(["border", "borderBottom", "borderLeft", "borderRight", "borderTop"]);

/** The JSX attributes that take a color (`<path fill="…">`): any other attribute's hex text isn't one (`href="#add"`) */
const COLOR_ATTRIBUTES = new Set(["bgcolor", "color", "fill", "stopColor", "stroke"]);

/** A style value that holds a color: a gradient, a shadow, a border */
const COLOR_CONTEXT = /gradient\(|shadow\(|\bsolid\b|\bdashed\b|\dpx\b/;

/** A color function of written values (`rgba(0, 0, 0, 0.3)`, `oklch(…)`, `color(srgb …)`); `rgba(var(--…))` reads the theme's */
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]|\bcolor\(\s*[a-z-]+\s+[\d.]/i;

/** The style properties that take a color */
const COLOR_PROPERTIES = new Set([
  "background",
  "backgroundColor",
  "bgcolor",
  "border",
  "borderBottom",
  "borderColor",
  "borderLeft",
  "borderRight",
  "borderTop",
  "boxShadow",
  "caretColor",
  "color",
  "fill",
  "filter",
  "outline",
  "outlineColor",
  "stroke",
  "textDecorationColor",
  "textShadow",
]);

/** A corner's own radius, which the theme's units don't reach (`borderTopLeftRadius: 1` is `1px`) */
const CORNERS = new Set([
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
]);

/** CSS's color names, which a style never writes: the theme's palette names its colors */
// oxfmt-ignore
const CSS_COLOR_NAMES = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue",
  "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
  "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
  "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite",
  "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo", "ivory",
  "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen",
  "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen",
  "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen",
  "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
  "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid",
  "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum",
  "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown",
  "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen",
  "steelblue", "tan", "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen",
]);

/** Two hex digits right after a color, its alpha (`${main}40`) */
const HEX_ALPHA_SUFFIX = /^[0-9a-f]{2}(?![\w])/i;

/** A hex color written out */
const HEX_COLOR = /(?<![\w&])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;

/** MUI's icon sizes, by the pixels they render: an icon takes the name as its `fontSize` prop */
const ICON_SIZES = new Map([
  [20, "small"],
  [24, "medium"],
  [35, "large"],
]);

/** The longhand keys `sx` has a shorthand for */
const LONGHANDS = new Map([
  ["backgroundColor", "bgcolor"],
  ["margin", "m"],
  ["marginBottom", "mb"],
  ["marginLeft", "ml"],
  ["marginRight", "mr"],
  ["marginTop", "mt"],
  ["padding", "p"],
  ["paddingBottom", "pb"],
  ["paddingLeft", "pl"],
  ["paddingRight", "pr"],
  ["paddingTop", "pt"],
]);

/** A box's margins, on every side */
const MARGINS = new Set(["m", "mb", "ml", "mr", "mt", "mx", "my"]);

/** A time or an easing written out: `200ms`, `0.3s`, `ease-in-out`, `cubic-bezier(…)` */
const MOTION_LITERAL = /\d(?:\.\d+)?m?s\b|\b(?:ease(?:-in|-out|-in-out)?|linear|steps)\b|cubic-bezier\(/;

/** The style properties that time a change */
const MOTION_PROPERTIES = new Set([
  "animation",
  "animationDelay",
  "animationDuration",
  "animationTimingFunction",
  "transition",
  "transitionDelay",
  "transitionDuration",
  "transitionTimingFunction",
]);

/** MUI's transitions, which the theme runs (a dialog grows in): a page fades in with `PageTransition` */
const MUI_TRANSITIONS = new Set(["Fade", "Grow", "Slide", "Zoom"]);

/** The style keys that space a box, inside or out */
const SPACING_KEYS = new Set(["gap", "m", "mb", "ml", "mr", "mt", "mx", "my", "p", "pb", "pl", "pr", "pt", "px", "py"]);

/** The packages that export MUI's `styled` */
const STYLED_SOURCES = new Set(["@mui/material", "@mui/material/styles", "@mui/system"]);

/** The props that time a component's own transition (`<Collapse timeout={…}>`) */
const TIMING_PROPS = new Set(["timeout", "transitionDuration"]);

/** Whether a margin only aligns (`auto`) or resets (`0`), on every side and screen it names */
function alignsOrResets(value) {
  if (value.type === "ObjectExpression")
    return value.properties.every((p) => p.type === "Property" && alignsOrResets(p.value));
  if (value.type !== "Literal") return false;
  return value.value === 0 || value.value === "auto";
}

function createBorders(context) {
  if (!inClient(context) || inTheme(context)) return {};
  return {
    Property(node) {
      const key = keyName(node);
      if (BORDER_SIDES.has(key) && styleValues(node.value).some(writesText)) {
        context.report({
          node: node.value,
          message:
            "A border is the theme's shorthand: a width (`border: 1`, `borderLeft: 3`), its color in `borderColor`, " +
            'its style in `borderStyle`: never `"1px solid …"`.',
        });
      }
    },
  };
}

function createFlexLayout(context) {
  if (!inClient(context)) return {};
  return {
    ImportSpecifier(node) {
      const grid = node.imported.name === "Grid" || node.imported.name === "Grid2";
      if (grid && node.parent.source.value === "@mui/material")
        context.report({ node, message: 'A grid is a `Box` (`display: "grid"`), never MUI\'s `Grid`.' });
    },
    JSXOpeningElement(node) {
      if (node.name.type !== "JSXIdentifier" || (node.name.name !== "div" && node.name.name !== "p")) return;
      context.report({
        node,
        message: "An element is a `Box` (a `div`) or a `Typography` (a `p`), never a raw `div` or `p`.",
      });
    },
    JSXElement(node) {
      if (elementName(node) !== "Box" || node.children.length > 0) return;
      const sx = sxObject(node);
      const only = sx?.properties.length === 1 ? sx.properties[0] : null;
      if (only?.type !== "Property" || (keyName(only) !== "flex" && keyName(only) !== "flexGrow")) return;
      if (keyName(only) === "flexGrow" && only.value.type === "Literal" && only.value.value === 1) return;
      context.report({ node: only, message: "A spacer is `<Box sx={{ flexGrow: 1 }} />`." });
    },
    Property(node) {
      const key = keyName(node);
      if (key !== "display" && key !== "gap" && key !== "flexDirection") return;
      if (node.parent.type !== "ObjectExpression") return;
      const owner = sxOwner(node.parent);
      const unowned = !owner && isSxConstant(node.parent);
      if ((owner || unowned) && owner !== "Stack" && owner !== "slot" && key === "display" && showsFlex(node.value)) {
        context.report({
          node,
          message:
            "A flex container is a `Stack` (`direction`, `spacing`; the rest in `sx`), never another element with a " +
            "flex `display`.",
        });
      }
      if (owner === "Stack" && key !== "display")
        context.report({ node, message: "A `Stack` takes its `direction` and `spacing` as props, never `sx`." });
    },
  };
}

function createHeadings(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Typography" || hasAttribute(node, "component")) return;
      const variant = node.openingElement.attributes.find(
        (a) => a.type === "JSXAttribute" && a.name.name === "variant",
      );
      const titled = variant?.value?.type === "Literal" && /^(h[1-6]|subtitle[12])$/.test(variant.value.value);
      if (!titled && headingVariants(sxObject(node)).length === 0) return;
      context.report({
        node: node.openingElement,
        message:
          'A `Typography` sized as a heading or a subtitle says what it is: `component="h1"` for a page\'s title, ' +
          "`h2` for its sections, `h3` within those and in a dialog, `p` when it isn't one.",
      });
    },
  };
}

function createMotion(context) {
  if (!inClient(context)) return {};
  const theme = inTheme(context);
  const report = (node) =>
    context.report({
      node,
      message:
        "Motion is timed by `theme/animations.ts`: an animation it names (`ANIMATIONS.diceRoll`), a transition of its " +
        "`DURATION` and `EASING` tokens; keyframes and MUI's transitions are the theme's.",
    });
  const reportStill = (node) =>
    context.report({
      node,
      message:
        "What moves stops for a viewer who asked for less motion: the style that animates, or that moves on " +
        "`&:hover`, sets `[PREFERS_REDUCED_MOTION]` too.",
    });
  return {
    ImportSpecifier(node) {
      if (theme) return;
      const transition = MUI_TRANSITIONS.has(node.imported.name) && node.parent.source.value === "@mui/material";
      if (node.imported.name === "keyframes" || transition) report(node);
    },
    JSXAttribute(node) {
      if (theme || node.name.type !== "JSXIdentifier" || !TIMING_PROPS.has(node.name.name)) return;
      const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
      if (value && writesTiming(value)) report(node);
    },
    Literal(node) {
      if (!theme && typeof node.value === "string" && node.value.includes("cubic-bezier(")) report(node);
    },
    Property(node) {
      const key = keyName(node);
      if (typeof key === "string" && key.startsWith("@keyframes") && !theme) return report(node);
      if (MOTION_PROPERTIES.has(key) && !theme) {
        const value = node.value;
        if (value.type === "Literal" && typeof value.value === "string" && value.value !== "none") report(value);
        if (value.type === "TemplateLiteral" && timesItself(value, context.sourceCode)) report(value);
      }
      if (!movesOnItsOwn(node) || node.parent.type !== "ObjectExpression") return;
      const root = sxRoot(node.parent);
      if (root && !stillsForReducedMotion(root)) reportStill(node);
    },
  };
}

function createShadows(context) {
  if (!inClient(context) || inTheme(context)) return {};
  return {
    Property(node) {
      const key = keyName(node);
      const shadow = key === "boxShadow" || key === "textShadow";
      const dropShadow = key === "filter" && context.sourceCode.getText(node.value).includes("drop-shadow(");
      if (!shadow && !dropShadow) return;
      if (!styleValues(node.value).some((value) => writesText(value) || value.type === "TemplateLiteral")) return;
      context.report({
        node: node.value,
        message:
          "A shadow is the theme's: an elevation (`boxShadow: 2`) or one it names (`theme.boxShadows.banner`, " +
          "`theme.textShadows.hero`, `theme.dropShadows.authLogo`), never one written out.",
      });
    },
  };
}

function createShape(context) {
  if (!inClient(context) || inTheme(context)) return {};
  return {
    Property(node) {
      const key = keyName(node);
      const value = node.value.type === "Literal" ? node.value.value : undefined;
      if (key === "borderRadius" && typeof value === "string" && value !== "50%") {
        context.report({
          node: node.value,
          message:
            'A corner is the theme\'s: `borderRadius` in its units (`1` is `shape.borderRadius`) or a circle `"50%"`.',
        });
      }
      if (CORNERS.has(key) && value !== 0) {
        context.report({
          node: node.value,
          message:
            "A corner of its own only drops to `0` beside the box's `borderRadius` (`borderBottomLeftRadius: 0`): " +
            "the theme's units don't reach it.",
        });
      }
      if (SPACING_KEYS.has(key) && styleValues(node.value).some((v) => /\dpx\b/.test(String(v.value ?? ""))))
        context.report({ node: node.value, message: "Spacing is in the theme's units (`p: 1.5`), never pixels." });

      if (key === "zIndex" && typeof value === "number" && value > 1) {
        context.report({
          node: node.value,
          message: "A layer is the theme's (`theme.zIndex.drawer + 1`); a number orders siblings only (`0`, `1`).",
        });
      }
    },
  };
}

function createSpacing(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      // A field's `margin` (`"normal"`, `"dense"`) sets its own margins: its form's `Stack` spaces it instead
      if (node.name.type !== "JSXIdentifier" || node.name.name !== "margin") return;
      if (node.value?.type === "Literal" && node.value.value === "none") return;
      context.report({
        node,
        message:
          "A field sets no `margin`: the gap between it and the next block is their `Stack`'s `spacing`, as between " +
          "any blocks.",
      });
    },
    Property(node) {
      const key = keyName(node);
      if (!MARGINS.has(key) && !LONGHANDS.get(key)?.startsWith("m")) return;
      if (node.parent.type !== "ObjectExpression" || (!sxOwner(node.parent) && !isSxConstant(node.parent))) return;
      if (alignsOrResets(node.value)) return;
      context.report({
        node,
        message:
          "The gap between blocks is their `Stack`'s `spacing`, never a block's own margin; an indent is padding, a " +
          'heading\'s gutter `gutterBottom`. A margin only aligns (`mx: "auto"`) or resets (`0`), side by side, never ' +
          "in one string: nothing bleeds past its parent's padding.",
      });
    },
  };
}

function createSxConventions(context) {
  if (!inClient(context)) return {};
  const isMobileHook = repoPath(context.filename) === "client/src/hooks/useIsMobile.ts";
  return {
    ArrowFunctionExpression(node) {
      // A style's value that reads the theme takes it whole, by its name: `color: (theme) => theme.palette…`
      if (node.parent.type !== "Property" || node.parent.value !== node || !inSx(node)) return;
      const [param] = node.params;
      if (node.params.length === 1 && param.type === "Identifier" && param.name === "theme") return;
      context.report({ node, message: "A style's value reads the theme as `(theme) => …`, its one parameter." });
    },
    BinaryExpression(node) {
      const reads = [node.left, node.right].some(readsMode);
      if (!reads) return;
      const dark = [node.left, node.right].some((side) => side.type === "Literal" && side.value === "dark");
      if (node.operator === "===" && dark && !storedAway(node)) return;
      context.report({
        node,
        message: 'The theme\'s mode is branched on as `theme.palette.mode === "dark"`, right in the style it picks.',
      });
    },
    ImportSpecifier(node) {
      const hook = node.imported.name === "useTheme" || node.imported.name === "useMediaQuery";
      if (!hook || isMobileHook || !node.parent.source.value.startsWith("@mui/")) return;
      context.report({
        node,
        message:
          "A style reads the theme in `sx` (`color: (theme) => …`, a palette token); MUI's `useTheme` and " +
          "`useMediaQuery` are `useIsMobile`'s.",
      });
    },
    Identifier(node) {
      // A constant a style takes whole, from this module or another, is named for it: `ROW_SX`
      if (!/^[A-Z][A-Z0-9_]*$/.test(node.name) || node.name.endsWith("_SX") || !takesWhole(node)) return;
      context.report({ node, message: "A constant a style takes is named for it, `…_SX`." });
    },
    JSXAttribute(node) {
      if (node.name.type !== "JSXIdentifier" || node.name.name !== "sx") return;
      const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : null;
      if (value?.type !== "ArrowFunctionExpression" && value?.type !== "FunctionExpression") return;
      context.report({
        node,
        message: "`sx` is an object whose values may read the theme (`color: (theme) => …`), never a function.",
      });
    },
    Literal(node) {
      if (typeof node.value !== "string" || !/!\s*important/.test(node.value) || inFrameSelector(node)) return;
      context.report({
        node,
        message:
          'A style wins by its selector, never `!important`: only a third party\'s frame (`"& iframe"`), whose ' +
          "inline style no selector beats, takes it.",
      });
    },
    Property(node) {
      const key = keyName(node);
      if (BACKGROUND_KEYS.has(key) && node.parent.type === "ObjectExpression" && sxOwner(node.parent) === "AppBar") {
        context.report({
          node: node.key,
          message:
            "The theme paints the app bar (`MuiAppBar`, `theme/appTheme.ts`): an `AppBar`'s `sx` sets no background.",
        });
      }
      if (!LONGHANDS.has(key) || !inSx(node)) return;
      context.report({ node: node.key, message: `\`sx\` writes \`${LONGHANDS.get(key)}\`, MUI's shorthand.` });
    },
    SpreadElement(node) {
      if (node.parent.type !== "ObjectExpression" || !inSx(node)) return;
      const argument = node.argument;
      const conditional = argument.type === "LogicalExpression" || argument.type === "ConditionalExpression";
      const callers = argument.type === "Identifier" ? argument.name : argument.property?.name;
      if (!conditional && callers !== "sx") return;
      context.report({
        node,
        message:
          "A style on a condition, or a caller's `sx`, joins `sx` as an array: " +
          "`sx={[{ … }, open && { … }, ...(Array.isArray(sx) ? sx : [sx])]}`.",
      });
    },
    ConditionalExpression(node) {
      if (!inSx(node)) return;
      const empty = (branch) =>
        (branch.type === "ObjectExpression" && branch.properties.length === 0) ||
        (branch.type === "Identifier" && branch.name === "undefined");
      if (!empty(node.consequent) && !empty(node.alternate)) return;
      // A property's value on a condition is a value (`color: done ? "success.main" : undefined`), its theme callback's too
      const holder = node.parent.type === "ArrowFunctionExpression" ? node.parent.parent : node.parent;
      if (holder.type === "Property" && !isSelector(holder) && keyName(holder) !== "sx") return;
      context.report({
        node,
        message: "A style on a condition joins `sx` as an array: `sx={[{ … }, open && { … }]}`.",
      });
    },
  };
}

function createSxStyles(context) {
  if (!inClient(context)) return {};
  const report = (node) =>
    context.report({
      node,
      message:
        "A style is written with `sx`: never `styled()`, no stylesheet but the fonts `main.tsx` loads (the page's own " +
        "are `theme/globalStyles.ts`' `GLOBAL_STYLES`), and `style` only passes on one a component is given " +
        '(`{ ...props.style }`); a table\'s column is a `Box component="col"`.',
    });
  // What a file imports MUI's packages whole as (`import * as M from "@mui/material"`), whose `M.styled` it reports
  const namespaces = new Set();
  return {
    ImportDeclaration(node) {
      const source = node.source.value;
      const font = repoPath(context.filename) === "client/src/main.tsx" && source.startsWith("@fontsource");
      const stylesheet = source.endsWith(".css") && !font;
      const styled = node.specifiers.some((s) => s.type === "ImportSpecifier" && s.imported.name === "styled");
      if (stylesheet || source === "@emotion/styled" || (STYLED_SOURCES.has(source) && styled)) report(node);
      if (!STYLED_SOURCES.has(source)) return;
      for (const specifier of node.specifiers)
        if (specifier.type !== "ImportSpecifier") namespaces.add(specifier.local.name);
    },
    JSXAttribute(node) {
      if (node.name.type !== "JSXIdentifier" || node.name.name !== "style") return;
      const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : null;
      if (!passesStyleOn(value)) report(node);
    },
    MemberExpression(node) {
      const ofNamespace = node.object.type === "Identifier" && namespaces.has(node.object.name);
      if (ofNamespace && !node.computed && node.property.name === "styled") report(node);
    },
    Property(node) {
      if (keyName(node) !== "style" || passesStyleOn(node.value)) return;
      for (let p = node.parent; p; p = p.parent) if (p.type === "JSXAttribute") return report(node);
    },
  };
}

function createThemeColors(context) {
  if (!inClient(context) || inTheme(context)) return {};
  const report = (node) =>
    context.report({
      node,
      message:
        'A color is the theme\'s (`client/src/theme/`): a palette token (`"text.secondary"`, ' +
        "`theme.palette.gold.main`), translucent through `alpha()`, never a color written out or a hex alpha appended.",
    });
  return {
    ImportDeclaration(node) {
      if (node.source.value.startsWith("@mui/material/colors")) report(node);
    },
    Literal(node) {
      if (typeof node.value !== "string") return;
      const attribute = node.parent.type === "JSXAttribute" ? node.parent.name.name : null;
      const hex = HEX_COLOR.test(node.value) && (attribute === null || COLOR_ATTRIBUTES.has(attribute));
      const named = COLOR_ATTRIBUTES.has(attribute) && CSS_COLOR_NAMES.has(node.value.toLowerCase());
      if (hex || named || COLOR_FUNCTION.test(node.value)) report(node);
    },
    Property(node) {
      if (!COLOR_PROPERTIES.has(keyName(node))) return;
      const texts =
        node.value.type === "Literal" && typeof node.value.value === "string"
          ? [node.value.value]
          : node.value.type === "TemplateLiteral"
            ? node.value.quasis.map((quasi) => quasi.value.cooked ?? "")
            : [];
      // A palette token's path (`common.white`) names the theme's color, not CSS's
      const words = texts.flatMap(
        (text) =>
          text
            .replace(/[\w-]+(?:\.[\w-]+)+/g, " ")
            .toLowerCase()
            .match(/[a-z]+/g) ?? [],
      );
      if (words.some((word) => CSS_COLOR_NAMES.has(word))) report(node.value);
    },
    TemplateLiteral(node) {
      const texts = node.quasis.map((quasi) => quasi.value.cooked ?? "");
      if (texts.some((text) => HEX_COLOR.test(text) || COLOR_FUNCTION.test(text))) return report(node);
      const css = COLOR_CONTEXT.test(texts.join(""));
      const suffixed = node.expressions.some(
        (expression, index) =>
          HEX_ALPHA_SUFFIX.test(texts[index + 1]) &&
          (css || context.sourceCode.getText(expression).includes("palette")),
      );
      if (suffixed) report(node);
    },
  };
}

function createTypeScale(context) {
  if (!inClient(context) || inTheme(context)) return {};
  return {
    JSXAttribute(node) {
      if (node.name.type !== "JSXIdentifier" || node.name.name !== "align") return;
      if (node.parent.name.type !== "JSXIdentifier" || node.parent.name.name !== "Typography") return;
      context.report({ node, message: "Text aligns with `sx` `textAlign`, never `align`." });
    },
    Property(node) {
      const key = keyName(node);
      if (key === "WebkitLineClamp")
        return context.report({ node, message: "Lines clamp through `lineClampSx(lines)` (`theme/text.ts`)." });

      if (key === "fontWeight" && node.value.type === "Literal" && typeof node.value.value === "string") {
        return context.report({
          node: node.value,
          message: "A font weight is a number (`fontWeight: 700`), never a word.",
        });
      }
      const owner = node.parent.type === "ObjectExpression" ? sxOwner(node.parent) : null;
      if (key === "typography" && node.value.type === "Literal" && owner === "Typography") {
        return context.report({
          node,
          message:
            'A `Typography`\'s variant is its `variant`: `sx` takes a responsive one (`{ xs: "body1", sm: "h6" }`).',
        });
      }
      if (key !== "fontSize" || !owner) return;
      const icon = /icon$/i.test(owner);
      const sizes = styleValues(node.value);
      const named = sizes.find((v) => v.type === "Literal" && ICON_SIZES.has(v.value));
      if (icon && named) {
        return context.report({
          node: node.value,
          message: `An icon takes MUI's named sizes as its \`fontSize\` prop: \`fontSize="${ICON_SIZES.get(named.value)}"\`.`,
        });
      }
      const pixels = sizes.some(
        (v) => v.type === "Literal" && (typeof v.value === "number" || /\dpx$/.test(String(v.value))),
      );
      if (!icon && pixels) {
        context.report({
          node: node.value,
          message: 'Text sizes itself in `rem` (`fontSize: "0.75rem"`), as the theme\'s variants do, never pixels.',
        });
      }
    },
  };
}

/** The heading variants a style object's `typography` takes, responsive ones included (`{ xs: "h6", sm: "h5" }`). */
function headingVariants(object) {
  const typography = object?.properties.find((p) => p.type === "Property" && keyName(p) === "typography");
  if (!typography) return [];
  const values =
    typography.value.type === "ObjectExpression" ? typography.value.properties.map((p) => p.value) : [typography.value];
  return values.filter((v) => v?.type === "Literal" && /^h[1-6]$/.test(v.value));
}

/** Whether `node` styles a third party's frame (`"& iframe": {…}`), whose inline style only `!important` beats. */
function inFrameSelector(node) {
  for (let p = node.parent; p; p = p.parent)
    if (p.type === "Property" && isSelector(p) && /\biframe\b/.test(keyName(p))) return true;

  return false;
}

/** Whether `node` styles something: it's in an `sx` (at any depth: a nested selector's too) or an `…_SX` constant. */
function inSx(node) {
  for (let p = node.parent; p; p = p.parent) {
    // A slot's own `sx` (`slotProps={{ paper: { sx: {…} } }}`) styles that slot
    if (p.type === "Property" && keyName(p) === "sx") return true;
    if (p.type === "JSXAttribute") return p.name.type === "JSXIdentifier" && p.name.name === "sx";
    if (p.type === "VariableDeclarator") return p.id.type === "Identifier" && p.id.name.endsWith("_SX");
  }
  return false;
}

/** Whether `node` is the theme's own file, where every value a style takes is written out. */
function inTheme(context) {
  return repoPath(context.filename).startsWith("client/src/theme/");
}

/** Whether a property is a selector's (`"&:hover": {…}`, `"& .MuiChip-icon": {…}`), whose object styles a state or a part. */
function isSelector(property) {
  const key = keyName(property);
  return typeof key === "string" && /^[&@:[]/.test(key);
}

/** Whether an object is an `…_SX` constant's whole style, which styles the element it's handed to. */
function isSxConstant(object) {
  const holder = object.parent?.type === "TSAsExpression" ? object.parent.parent : object.parent;
  return holder?.type === "VariableDeclarator" && holder.id.type === "Identifier" && holder.id.name.endsWith("_SX");
}

/** The name a property goes by, written as a name or a string: `color`, `"&:hover"`; null for a computed one. */
function keyName(property) {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  return property.key.type === "Literal" && typeof property.key.value === "string" ? property.key.value : null;
}

/** Whether a style property moves its box on its own: an animation, or a transform on a state (`"&:hover"`). */
function movesOnItsOwn(property) {
  const key = keyName(property);
  if (key === "animation") return !(property.value.type === "Literal" && property.value.value === "none");
  if (key !== "transform" || (property.value.type === "Literal" && property.value.value === "none")) return false;
  const holder = property.parent.parent;
  return holder?.type === "Property" && isSelector(holder) && /:(hover|active|focus)/.test(keyName(holder));
}

/** Whether a style object passes on one its component was given: `{ ...props.style, … }`. */
function passesStyleOn(value) {
  return (
    value?.type === "ObjectExpression" &&
    value.properties.some(
      (p) =>
        p.type === "SpreadElement" &&
        ((p.argument.type === "MemberExpression" && !p.argument.computed && p.argument.property.name === "style") ||
          (p.argument.type === "Identifier" && p.argument.name === "style")),
    )
  );
}

/** Whether an expression reads the theme's mode: `theme.palette.mode`. */
function readsMode(node) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.name === "mode" &&
    node.object.type === "MemberExpression" &&
    node.object.property.name === "palette"
  );
}

/** Whether a flex `display` shows the box as flex, on any screen: `"flex"`, `{ xs: "none", sm: "flex" }`. */
function showsFlex(value) {
  if (value.type === "Literal") return value.value === "flex" || value.value === "inline-flex";
  if (value.type === "ObjectExpression")
    return value.properties.some((p) => p.type === "Property" && showsFlex(p.value));
  return false;
}

/** Whether a style object stops what moves for a viewer who asked for less motion: its `[PREFERS_REDUCED_MOTION]`. */
function stillsForReducedMotion(root) {
  return root.properties.some(
    (p) =>
      p.type === "Property" && p.computed && p.key.type === "Identifier" && p.key.name === "PREFERS_REDUCED_MOTION",
  );
}

/** Whether a comparison's answer is kept for later (`const darkMode = …`), rather than picking a style in place. */
function storedAway(node) {
  const holder = node.parent;
  return holder.type === "VariableDeclarator" || holder.type === "AssignmentExpression";
}

/** The values a style property can take: a condition's branches, what a theme callback returns. */
function styleValues(value) {
  if (value.type === "ConditionalExpression")
    return [...styleValues(value.consequent), ...styleValues(value.alternate)];
  if (value.type === "LogicalExpression") return [...styleValues(value.left), ...styleValues(value.right)];
  if (value.type === "ArrowFunctionExpression" && value.body.type !== "BlockStatement") return styleValues(value.body);
  if (value.type === "ObjectExpression")
    return value.properties.flatMap((p) => (p.type === "Property" ? styleValues(p.value) : []));
  return [value];
}

/** The style object an element's `sx` holds, when it's written right in the attribute. */
function sxObject(element) {
  const attribute = element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "sx");
  const value = attribute?.value?.type === "JSXExpressionContainer" ? attribute.value.expression : null;
  return value?.type === "ObjectExpression" ? value : null;
}

/**
 * The JSX element whose own `sx` a style object is: right in the attribute, in its array, a branch of a condition, or
 * what its theme callback returns. A nested selector's object (`"&:hover": {…}`) styles something else.
 */
function sxOwner(object) {
  let node = object;
  for (let parent = node.parent; parent; node = parent, parent = parent.parent) {
    if (parent.type === "JSXExpressionContainer") {
      const attribute = parent.parent;
      if (attribute?.type !== "JSXAttribute" || attribute.name.name !== "sx") return null;
      const element = attribute.parent.name;
      if (element.type === "JSXIdentifier") return element.name;
      return element.type === "JSXMemberExpression" ? element.property.name : null;
    }
    // A slot's own `sx` (`slotProps={{ paper: { sx: {…} } }}`), which styles that slot
    if (parent.type === "Property" && parent.value === node && keyName(parent) === "sx") return "slot";
    const passes =
      parent.type === "ArrayExpression" ||
      parent.type === "SpreadElement" ||
      (parent.type === "ObjectExpression" && node.type === "SpreadElement") ||
      parent.type === "ConditionalExpression" ||
      parent.type === "LogicalExpression" ||
      parent.type === "ReturnStatement" ||
      parent.type === "BlockStatement" ||
      parent.type === "TSAsExpression" ||
      (parent.type === "ArrowFunctionExpression" && parent.body === node);
    if (!passes) return null;
  }
  return null;
}

/** The outermost style object a style object is part of: an `sx`'s own, an `…_SX` constant's, a helper's return. */
function sxRoot(object) {
  let root = object;
  for (let p = object.parent; p; p = p.parent) {
    if (p.type === "ObjectExpression") root = p;
    else if (p.type !== "Property" && p.type !== "ArrowFunctionExpression" && p.type !== "ConditionalExpression") break;
  }
  return inSx(root) || isSxConstant(root) || root.parent?.type === "ReturnStatement" ? root : null;
}

/** Whether a style takes `node` whole: as its `sx`, an element of its array, or a spread (through a condition), not as a property's value. */
function takesWhole(node) {
  let child = node;
  for (let p = node.parent; p; child = p, p = p.parent) {
    if (p.type === "LogicalExpression" || (p.type === "ConditionalExpression" && p.test !== child)) continue;
    if (p.type === "SpreadElement" || p.type === "ArrayExpression") return inSx(p);
    if (p.type === "JSXExpressionContainer") return p.parent.type === "JSXAttribute" && p.parent.name.name === "sx";
    return false;
  }
  return false;
}

/** Whether a template literal times something by its own numbers: a literal time, or a time no `DURATION` gives (`${i * 80}ms`). */
function timesItself(template, sourceCode) {
  const texts = template.quasis.map((quasi) => quasi.value.cooked ?? "");
  if (texts.some((text) => MOTION_LITERAL.test(text))) return true;
  return template.expressions.some(
    (expression, index) => /^m?s\b/.test(texts[index + 1]) && !sourceCode.getText(expression).includes("DURATION."),
  );
}

/** Whether a style value writes its text out: a string (but `"none"`), or a template. */
function writesText(value) {
  return (
    (value.type === "Literal" && typeof value.value === "string" && value.value !== "none") ||
    value.type === "TemplateLiteral"
  );
}

/** Whether a transition's timing prop writes its time out: `250`, `{ enter: 250, exit: 150 }` (not `DURATION.normal`). */
function writesTiming(value) {
  if (value.type === "Literal") return typeof value.value === "number";
  if (value.type === "ObjectExpression")
    return value.properties.some((p) => p.type === "Property" && writesTiming(p.value));
  return false;
}

export default {
  borders: { meta: { type: "suggestion" }, create: createBorders },
  "flex-layout": { meta: { type: "suggestion" }, create: createFlexLayout },
  headings: { meta: { type: "suggestion" }, create: createHeadings },
  motion: { meta: { type: "suggestion" }, create: createMotion },
  shadows: { meta: { type: "suggestion" }, create: createShadows },
  shape: { meta: { type: "suggestion" }, create: createShape },
  spacing: { meta: { type: "suggestion" }, create: createSpacing },
  "sx-conventions": { meta: { type: "suggestion" }, create: createSxConventions },
  "sx-styles": { meta: { type: "suggestion" }, create: createSxStyles },
  "theme-colors": { meta: { type: "suggestion" }, create: createThemeColors },
  "type-scale": { meta: { type: "suggestion" }, create: createTypeScale },
};
