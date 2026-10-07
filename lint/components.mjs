/**
 * The client's shared components, each the one way to write its pattern (docs/frontend.md):
 *
 * - `dialog-footers`: a dialog's footer is a `DialogFooter` (its way out, then its own steps, then its action), never
 *   `DialogActions` written by hand; its action, the one contained button, is its `action`, never one of its steps.
 * - `add-buttons`: a button that adds something is an `AddButton`, never a `Button` given the add icon or the words.
 * - `confirm-dialogs`: a confirmation is a `ConfirmDialog` (`DeleteDialog`), over a page or over a dialog alike; a
 *   save's rules warnings are a `ValidationIssuesAlert`. No other alert carries actions, and no "Are you sure" is
 *   written by hand.
 * - `link-buttons`: an action written as a link is a `LinkButton`, never a `MuiLink component="button"`.
 * - `choice-chips`: a chip that is one of several to choose (its look switched by a selection) is a `ChoiceChip`.
 * - `next-page-spinners`: the spinner at the foot of a list that loads its next page as it scrolls is a
 *   `NextPageSpinner`.
 * - `option-tooltips`: the level-up wizard's option tooltip (a description, or the tree of what it asks) is an
 *   `OptionTooltip`, every tooltip of its steps.
 * - `anchor-menus`: a menu that opens from what was clicked keeps its anchor through `useAnchorMenu`.
 * - `select-fields`: a select bound to a form's field is a `SelectField`; a custom input its owner binds (handed the
 *   field's ref) keeps its own select.
 * - `form-validation`: a form is `noValidate`, so its rules check its fields and say why, never the browser; a bound
 *   field that asks the browser to check it (`required`, `type="email"`) has `rules`, and one with native bounds
 *   (`htmlInput: { min, max }`, which its stepper keeps) checks them with `wholeNumberRules`.
 * - `expand-arrows`: a toggle that shows or hides something leads with one arrow, `ExpandArrow`: a heading's is its
 *   `ToggleLabel`, a row's its first cell's, under `toggleProps` (an accordion's is MUI's, which the theme puts first).
 *   No other expand icon, and no arrow-only button but a `ToggleLabel`'s.
 * - `toggle-states`: a button that flips between two states keeps one label, naming what it turns on, and says which
 *   state it's in: `aria-pressed`, or `aria-expanded` when it shows or hides something.
 * - `table-frames`: a table on a page or in a dialog is framed by a `TableFrame` (a table in a panel stands bare), and
 *   the theme draws its header: no cell of it sets its tint, weight or color, nor bolds its label.
 * - `card-titles`: a card's or a panel's title (an `h2` sized from `h6` up) is a `CardTitle`.
 * - `blank-notes`: an empty list's line ("No local changes") is a `BlankNote` in a panel, a dialog, a menu or the level
 *   wizard, and a page's or a tab's is a `BlankState`, its icon and its line required: never a `Typography` or an
 *   `Alert` of its own. A note (a `BlankNote`, a picker's `noOptionsText`) never ends with a period.
 * - `page-loaders`: a page's first load is a `PageLoader` (a character sheet's page draws the sheet's skeleton,
 *   `CharacterDetailSkeleton`); a section's or a dialog's spinner takes a section's spacing (`py: 4`) and nothing
 *   else, never the large size.
 * - `skeletons`: a skeleton means loading: a table's first load is a `TableSkeleton`, a page's its own skeleton (the
 *   sheet's, an entity page's), anything else a section's spinner; what's empty or hidden says so in a `BlankNote`.
 * - `panels`: a panel is a `Panel`, flat paper padded 16px on a phone and 32px above, in the theme's corner: never a
 *   `Card` (a list's or a stat's), nor a `Paper` padded by hand (a banner paints its own surface, a frame is
 *   outlined).
 * - `section-headings`: a heading under a card's title is a `SubsectionTitle` (8px above its content: the column it
 *   leads takes `spacing={1}`), and an entry's name in a panel's list an `EntryTitle`: never a Typography of its own.
 * - `page-gaps`: a page starts 32px under the app bar, the theme padding its `Container` (an invite's `sm` card keeps
 *   its own); its content sits 32px under its header (the column holding the header takes `spacing={4}`), and a tab's
 *   56px under its tabs, in a `SectionTabPanel`.
 * - `page-titles`: a page's title (its `h1`) is its header's: `PageHeader`, `DetailPageHeader`, or the header of a page
 *   that opens on its own (the dashboard, the auth pages, an invite).
 * - `list-toolbars`: a list's actions sit in its `ListToolbar` (`SearchBar` is one), never a bare row; the list sits
 *   24px under it (`spacing={3}`), and its Load More 16px under the list (`spacing={2}`).
 * - `empty-values`: a value that isn't there is an `EmptyValue`, never a dash of its own, and a description that isn't
 *   there says `NO_DESCRIPTION`, never a sentence of its own.
 * - `notification-messages`: a notification shows through `NotificationMessage` (`components/notifications`), its
 *   message, its details and its unread dot, wherever it shows; what an activity or a notification changed shows
 *   inline under it, in an `ActivityDetails`, never in a tooltip.
 * - `row-actions`: a row's actions are a `RowActions` of `RowAction`s (`components/common`), in a row that spreads
 *   `ROW_ACTIONS_HOVER_SX`: never buttons of their own, nor a `row-actions` class written by hand.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { calleeName, childElements, elementName, hasAttribute, inClient, parentElement } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** What a table's header leaves to the theme, which tints it and sets its labels' weight and color. */
const HEADER_STYLE_KEYS = new Set(["backgroundColor", "bgcolor", "color", "fontWeight"]);

/** A list's own actions, which sit in its toolbar: its add button, a ruleset section's `SectionActions` */
const LIST_ACTIONS = new Set(["AddButton", "SectionActions"]);

/** The bars above a list: its toolbar, or its search's */
const LIST_TOOLBARS = new Set(["ListToolbar", "SearchBar"]);

/** The words a missing description is said in, which `NO_DESCRIPTION` holds */
const NO_DESCRIPTION_WORDS = /^No description\b/;

/** The words of a notification or an activity, each said by its one component, the same on every surface */
const NOTIFICATION_FORMATTERS = {
  formatActivityDetails: {
    file: "client/src/components/notifications/ActivityDetails.tsx",
    message:
      "What an activity or a notification changed shows through `ActivityDetails` (`components/notifications`), " +
      "inline under it: a tooltip never opens on a phone.",
  },
  formatNotificationMessage: {
    file: "client/src/components/notifications/NotificationMessage.tsx",
    message:
      "A notification shows through `NotificationMessage` (`components/notifications`): its message, its details " +
      "inline and its unread dot, one way on every surface.",
  },
};

/** The pairs of words whose labels name a state and its opposite, A to Z within each; `Un…` pairs aside. */
const OPPOSITES = new Set(["Close Open", "Collapse Expand", "Hide Show"]);

/** A box's padding, which a panel takes from `Panel` */
const PADDINGS = new Set([
  "p",
  "padding",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingX",
  "paddingY",
  "pb",
  "pl",
  "pr",
  "pt",
  "px",
  "py",
]);

/** The headers a page opens on, its content 32px below them. */
const PAGE_HEADERS = new Set(["CharacterHeader", "DetailPageHeader", "PageHeader"]);

/**
 * The modules that write a page's title (its `h1`): the headers a page opens on (`CharacterHeader` and
 * `EntityDetailLayout` render `DetailPageHeader`), and the pages that open on their own: the dashboard's hero, the auth
 * pages' `AuthPage`, an invite's card, the error page.
 */
const PAGE_TITLE_MODULES = new Set([
  "client/src/components/auth/AuthLayoutRoute.tsx",
  "client/src/components/common/DetailPageHeader.tsx",
  "client/src/components/common/ErrorBoundary.tsx",
  "client/src/components/common/PageHeader.tsx",
  "client/src/components/invites/InviteLandingPage.tsx",
  "client/src/pages/dashboard/DashboardPage.tsx",
]);

/** The modules that draw a skeleton of what loads: a table's, the character sheet's, an entity page's */
const SKELETON_MODULES = new Set([
  "client/src/components/characters/CharacterDetailSkeleton.tsx",
  "client/src/components/common/TableSkeleton.tsx",
  "client/src/pages/rulesets/components/EntityDetailLayout.tsx",
]);

/** The levels under a card's `h2`: a sub-heading's or an entry's. */
const SUBHEADING_LEVELS = new Set(["h3", "h4", "h5", "h6"]);

/** What paints a surface of its own, a banner's (`PageHeader`'s, the dashboard's hero): not a panel's paper */
const SURFACES = new Set(["background", "backgroundColor", "bgcolor"]);

/** A box's padding at its top: a page's column takes the theme's */
const TOP_PADDINGS = new Set(["p", "padding", "paddingTop", "paddingY", "pt", "py"]);

/** The attribute `name` of a JSX element, when it has one. */
function attribute(element, name) {
  return element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === name);
}

/** What a JSX attribute holds: its expression, or its string. */
function attributeValue(found) {
  return found?.value?.type === "JSXExpressionContainer" ? found.value.expression : found?.value;
}

function createAddButtons(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/AddButton.tsx")) return {};
  const message = "A button that adds something is an `AddButton` (`components/common`).";
  return {
    JSXAttribute(node) {
      if (node.name.name !== "startIcon") return;
      const value = attributeValue(node);
      if (value?.type !== "JSXElement" || elementName(value) !== "AddIcon") return;
      context.report({ node, message });
    },
    // A button whose words add ("Add Item"), without the add icon (with it, its `startIcon` says so)
    JSXElement(node) {
      const icon = attributeValue(attribute(node, "startIcon"));
      if (elementName(node) !== "Button" || (icon?.type === "JSXElement" && elementName(icon) === "AddIcon")) return;
      const words = node.children.find((child) => child.type === "JSXText" && child.value.trim());
      if (words && /^\s*Add\b/.test(words.value)) context.report({ node: node.openingElement, message });
    },
  };
}

function createAnchorMenus(context) {
  if (!inClient(context) || inFile(context, "client/src/hooks/useAnchorMenu.ts")) return {};
  return {
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || node.callee.name !== "useState") return;
      const types = node.typeArguments ?? node.typeParameters;
      const text = types ? context.sourceCode.getText(types) : "";
      if (!/\bHTMLElement\b/.test(text) || !/\bnull\b/.test(text) || /Record</.test(text)) return;
      context.report({
        node,
        message: "A menu that opens from what was clicked keeps its anchor through `useAnchorMenu` (`hooks/`).",
      });
    },
  };
}

function createBlankNotes(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/BlankState.tsx")) return {};
  const period = (node) =>
    context.report({ node, message: "A note says what isn't there without a final period, as every note does." });
  return {
    JSXAttribute(node) {
      const value = attributeValue(node);
      if (node.name.name === "noOptionsText" && endsWithPeriod(value)) period(node);
    },
    JSXElement(node) {
      if (elementName(node) !== "BlankNote") return;
      const last = node.children.findLast((child) => child.type !== "JSXText" || child.value.trim());
      const text = last?.type === "JSXExpressionContainer" ? last.expression : last;
      if (endsWithPeriod(text)) period(node.openingElement);
    },
    JSXText(node) {
      if (!/^\s*No\s+\w/.test(node.value) || !["Alert", "Typography"].includes(elementName(parentElement(node))))
        return;
      context.report({
        node,
        message:
          "An empty list says so with a `BlankNote` (a panel's, a dialog's, a menu's, the level wizard's) or a " +
          "`BlankState` (a page's or a tab's).",
      });
    },
  };
}

function createCardTitles(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/CardTitle.tsx")) return {};
  return {
    JSXElement(node) {
      const component = attributeValue(attribute(node, "component"));
      if (elementName(node) !== "Typography" || component?.type !== "Literal" || component.value !== "h2") return;
      const sized = styleProperties(attributeValue(attribute(node, "sx")), node).some(
        (property) => propertyKey(property) === "typography" && property.value.type === "ObjectExpression",
      );
      if (sized)
        context.report({ node: node.openingElement, message: "A card's or a panel's title is a `CardTitle`." });
    },
  };
}

function createChoiceChips(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/ChoiceChip.tsx")) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Chip" || attributeValue(attribute(node, "variant"))?.type !== "ConditionalExpression")
        return;
      context.report({
        node: node.openingElement,
        message: "A chip that is one of several to choose, its look switched by a selection, is a `ChoiceChip`.",
      });
    },
  };
}

function createConfirmDialogs(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/ValidationIssuesAlert.tsx")) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "AnimatedAlert" || !hasAttribute(node, "action")) return;
      context.report({
        node: node.openingElement,
        message:
          "A confirmation is a `ConfirmDialog`, over a dialog too, and a save's rules warnings a " +
          "`ValidationIssuesAlert`: no other alert carries actions.",
      });
    },
    JSXText(node) {
      if (!/\bAre you sure\b/i.test(node.value) || inConfirmation(node)) return;
      context.report({
        node,
        message:
          "A confirmation is a `ConfirmDialog` (`DeleteDialog`), over a page or a dialog: never written by hand.",
      });
    },
  };
}

function createDialogFooters(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/DialogFooter.tsx")) return {};
  return {
    // Its own steps (a wizard's Back) go before its action, the one contained button: its `action`
    JSXElement(node) {
      const footer = parentElement(node);
      if (elementName(node) !== "Button" || !footer || elementName(footer) !== "DialogFooter") return;
      const variant = attributeValue(attribute(node, "variant"));
      if (variant?.type !== "Literal" || variant.value !== "contained") return;
      context.report({
        node: node.openingElement,
        message: "A dialog's action is its `DialogFooter`'s `action`, contained; its own steps (Back) are not.",
      });
    },
    ImportSpecifier(node) {
      if (node.imported.name !== "DialogActions" || node.parent.source.value !== "@mui/material") return;
      context.report({
        node,
        message: "A dialog's footer is a `DialogFooter` (its way out, then its action or its own steps).",
      });
    },
  };
}

function createEmptyValues(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/EmptyValue.tsx")) return {};
  const message = "A value that isn't there is an `EmptyValue` (`components/common`), never a dash of its own.";
  const noDescription = (node) =>
    context.report({
      node,
      message:
        "A description that isn't there says `NO_DESCRIPTION` (`components/common`), in the words every card and " +
        "header uses: never a sentence its owner didn't write.",
    });
  return {
    LogicalExpression(node) {
      const read = node.left.type === "ChainExpression" ? node.left.expression : node.left;
      const left = read.type === "MemberExpression" && !read.computed ? read.property : read;
      // A sentence of its own; the shared words written out are the `Literal` check's
      const stock =
        node.right.type === "Literal" &&
        typeof node.right.value === "string" &&
        node.right.value !== "" &&
        !NO_DESCRIPTION_WORDS.test(node.right.value);
      if (node.operator !== "&&" && left.type === "Identifier" && left.name === "description" && stock)
        noDescription(node.right);
    },
    JSXText(node) {
      // A dash alone in its element; one between words ("— 3/day") is punctuation
      const children = node.parent.children.filter((child) => child.type !== "JSXText" || child.value.trim());
      if (node.value.trim() === "—" && children.length === 1) context.report({ node, message });
    },
    Literal(node) {
      if (node.value === "—") context.report({ node, message });
      else if (typeof node.value === "string" && NO_DESCRIPTION_WORDS.test(node.value)) noDescription(node);
    },
  };
}

function createExpandArrows(context) {
  if (!inClient(context)) return {};
  const file = repoPath(context.filename);
  return {
    JSXElement(node) {
      const name = elementName(node);
      const asExpandIcon =
        node.parent?.type === "JSXExpressionContainer" && node.parent.parent?.name?.name === "expandIcon";
      const arrow =
        name === "ExpandLessIcon" ||
        (name === "ExpandMoreIcon" && !asExpandIcon && file !== "client/src/components/common/ExpandArrow.tsx");
      // An arrow-only toggle is a `ToggleLabel`'s (the sidebar's chevron says which way it slides, not what it shows)
      const toggleButton =
        name === "IconButton" &&
        node.children.some((child) => child.type === "JSXElement" && elementName(child) === "ExpandArrow") &&
        file !== "client/src/components/common/ToggleLabel.tsx";
      const clickableToggle =
        hasAttribute(node, "aria-expanded") &&
        node.openingElement.attributes.some(
          (a) => a.type === "JSXSpreadAttribute" && context.sourceCode.getText(a).includes("clickableProps("),
        );
      if (!arrow && !toggleButton && !clickableToggle) return;
      context.report({
        node: node.openingElement,
        message:
          "A toggle leads with one arrow, `ExpandArrow`: a heading's is its `ToggleLabel`, a row's its first cell's " +
          'under `toggleProps(open, onToggle, "row")`; an accordion\'s is its `expandIcon`.',
      });
    },
  };
}

function createFormValidation(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      const raw = elementName(node) === "form";
      const component = attributeValue(attribute(node, "component"));
      const asForm = component?.type === "Literal" && component.value === "form";
      if (raw || asForm) {
        if (hasAttribute(node, "noValidate")) return;
        context.report({
          node: node.openingElement,
          message: "A form is `noValidate`: its rules check its fields and say why, never the browser.",
        });
        return;
      }
      const type = attributeValue(attribute(node, "type"));
      const nativeCheck = hasAttribute(node, "required") || (type?.type === "Literal" && type.value === "email");
      if (!hasAttribute(node, "control") || !nativeCheck || hasAttribute(node, "rules")) return;
      context.report({
        node: node.openingElement,
        message:
          "A bound field's checks are its `rules` (`EMAIL_RULES`, `OPTIONAL_EMAIL_RULES`, `requiredRules`): a " +
          "`noValidate` form never runs the browser's.",
      });
    },
    Property(node) {
      if (node.key.type !== "Identifier" || node.key.name !== "htmlInput" || node.value.type !== "ObjectExpression")
        return;
      const bounds = new Set(
        node.value.properties
          .filter((p) => p.type === "Property" && p.key.type === "Identifier")
          .map((p) => p.key.name)
          .filter((name) => ["max", "min", "pattern"].includes(name)),
      );
      const field = parentElement(node);
      if (bounds.size === 0 || !field || !hasAttribute(field, "control")) return;
      // `wholeNumberRules(min, required, max)`: the bounds the field's stepper keeps, checked as the form submits
      const rules = attributeValue(attribute(field, "rules"));
      const checked =
        rules?.type === "CallExpression" &&
        rules.callee.type === "Identifier" &&
        rules.callee.name === "wholeNumberRules" &&
        !bounds.has("pattern") &&
        (!bounds.has("max") || rules.arguments.length >= 3);
      if (checked) return;
      context.report({
        node,
        message:
          "A bound field's bounds are its `rules` (`wholeNumberRules(min, required, max)`, its `max` too): the " +
          "browser's own, which the stepper keeps, never check a `noValidate` form.",
      });
    },
  };
}

function createLinkButtons(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/LinkButton.tsx")) return {};
  return {
    JSXElement(node) {
      const component = attributeValue(attribute(node, "component"));
      if (elementName(node) !== "MuiLink" || component?.type !== "Literal" || component.value !== "button") return;
      context.report({ node: node.openingElement, message: "An action written as a link is a `LinkButton`." });
    },
  };
}

function createListToolbars(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Stack") return;
      const children = childElements(node).map(elementName);
      const spacing = attributeValue(attribute(node, "spacing"));
      const spaced = (units) => spacing?.type === "Literal" && spacing.value === units;
      if (children.some((child) => LIST_TOOLBARS.has(child)) && !spaced(3)) {
        context.report({
          node: node.openingElement,
          message:
            "A list sits 24px under its toolbar: the column holding a `ListToolbar` (`SearchBar`) takes `spacing={3}`.",
        });
      }
      if (children.includes("LoadMoreButton") && !spaced(2)) {
        context.report({
          node: node.openingElement,
          message: "Load More sits 16px under its list: the column holding a `LoadMoreButton` takes `spacing={2}`.",
        });
      }
      const endAligned = styleProperties(attributeValue(attribute(node, "sx")), node).some(
        (property) =>
          propertyKey(property) === "justifyContent" &&
          property.value.type === "Literal" &&
          property.value.value === "flex-end",
      );
      if (!isRow(node) || !endAligned || !children.some((child) => LIST_ACTIONS.has(child))) return;
      context.report({
        node: node.openingElement,
        message: "A list's actions sit in its toolbar, a `ListToolbar`'s `actions`: never a bare row of their own.",
      });
    },
  };
}

function createNextPageSpinners(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/NextPageSpinner.tsx")) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "DiceSpinner") return;
      const stack = parentElement(node);
      const list = stack && elementName(stack) === "Stack" ? parentElement(stack) : null;
      if (!list || elementName(list) !== "List") return;
      context.report({
        node: node.openingElement,
        message: "The spinner at the foot of a list that loads its next page is a `NextPageSpinner`.",
      });
    },
  };
}

function createNotificationMessages(context) {
  if (!inClient(context)) return {};
  return {
    CallExpression(node) {
      const name = calleeName(node);
      if (!Object.hasOwn(NOTIFICATION_FORMATTERS, name) || inFile(context, NOTIFICATION_FORMATTERS[name].file)) return;
      context.report({ node, message: NOTIFICATION_FORMATTERS[name].message });
    },
  };
}

function createOptionTooltips(context) {
  const file = "client/src/pages/characters/details/components/dnd3.5/OptionTooltip.tsx";
  if (!inClient(context) || inFile(context, file)) return {};
  // Every tooltip a level-up step shows is an option's (a skill's description, a feat's)
  const step = /^client\/src\/pages\/characters\/details\/components\/dnd3\.5\/\w+Step\.tsx$/.test(
    repoPath(context.filename),
  );
  return {
    JSXElement(node) {
      if (elementName(node) !== "Tooltip") return;
      const title = attributeValue(attribute(node, "title"));
      const text = title ? context.sourceCode.getText(title) : "";
      if (!step && !/requirementTree|\.slice\(0,/.test(text)) return;
      context.report({
        node: node.openingElement,
        message: "An option's tooltip (its description, or the tree of what it asks) is an `OptionTooltip`.",
      });
    },
  };
}

function createPageGaps(context) {
  if (!inClient(context)) return {};
  const tabPanelModule = inFile(context, "client/src/components/common/DetailPageHeader.tsx");
  return {
    JSXElement(node) {
      const name = elementName(node);
      const role = attributeValue(attribute(node, "role"));
      if (role?.type === "Literal" && role.value === "tabpanel" && !tabPanelModule) {
        context.report({
          node: node.openingElement,
          message: "A record page's tab panel is a `SectionTabPanel`: its content 56px under the tabs.",
        });
        return;
      }
      if (name === "Container") {
        // An invite's card stands alone in its `sm` column, centred, deeper than a page's content
        const maxWidth = attributeValue(attribute(node, "maxWidth"));
        if (maxWidth?.type === "Literal" && maxWidth.value === "sm") return;
        const properties = styleProperties(attributeValue(attribute(node, "sx")), node);
        if (!properties.some((property) => TOP_PADDINGS.has(propertyKey(property)))) return;
        context.report({
          node: node.openingElement,
          message:
            "A page starts 32px under the app bar, on a phone too: the theme pads its `Container`, whose `sx` never " +
            "sets its top.",
        });
        return;
      }
      if (name !== "Stack") return;
      if (!node.children.some((child) => child.type === "JSXElement" && PAGE_HEADERS.has(elementName(child)))) return;
      const spacing = attributeValue(attribute(node, "spacing"));
      if (spacing?.type === "Literal" && spacing.value === 4) return;
      context.report({
        node: node.openingElement,
        message: "A page's content sits 32px under its header: the column holding the header takes `spacing={4}`.",
      });
    },
  };
}

function createPageLoaders(context) {
  if (!inClient(context)) return {};
  const ownLoader = inFile(context, "client/src/components/common/PageLoader.tsx");
  const skeleton = inFile(context, "client/src/components/characters/CharacterDetailSkeleton.tsx");
  // A character sheet's page (the character's, a campaign's, a share link's) loads with the sheet's skeleton
  const pageLoaders = [];
  let showsSheet = false;
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "CharacterSheetBody") showsSheet = true;
      if (name === "PageLoader") pageLoaders.push(node);
      if (name !== "DiceSpinner") return;
      const size = attributeValue(attribute(node, "size"));
      const properties = styleProperties(attributeValue(attribute(node, "sx")), node);
      const large = size?.type === "Literal" && size.value === "large" && !skeleton;
      // A section's or a dialog's spinner: `py: 4` alone
      const styled =
        !ownLoader &&
        properties.some(
          (property) =>
            propertyKey(property) !== "py" || property.value.type !== "Literal" || property.value.value !== 4,
        );
      if (!large && !styled) return;
      context.report({
        node: node.openingElement,
        message:
          "A page's first load is a `PageLoader` (the character sheet draws its skeleton); a section's or a " +
          "dialog's spinner takes a section's spacing (`sx={{ py: 4 }}`) and nothing else, never the large size.",
      });
    },
    "Program:exit"() {
      if (!showsSheet) return;
      for (const node of pageLoaders) {
        context.report({
          node: node.openingElement,
          message: "A character sheet's first load is the sheet's skeleton, `CharacterDetailSkeleton`.",
        });
      }
    },
  };
}

function createPageTitles(context) {
  if (!inClient(context) || PAGE_TITLE_MODULES.has(repoPath(context.filename))) return {};
  return {
    JSXAttribute(node) {
      const value = attributeValue(node);
      if (node.name.name !== "component" || value?.type !== "Literal" || value.value !== "h1") return;
      context.report({
        node,
        message:
          "A page's title is its header's: `PageHeader`, `DetailPageHeader` (`CharacterHeader`'s, " +
          "`EntityDetailLayout`'s), or a page's that opens on its own (the dashboard's hero, `AuthPage`, an invite's card).",
      });
    },
  };
}

function createPanels(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/Panel.tsx")) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      const properties = styleProperties(attributeValue(attribute(node, "sx")), node);
      const keys = properties.map(propertyKey);
      if (name === "Card" && holdsTitle(node)) {
        context.report({
          node: node.openingElement,
          message: "A panel is a `Panel`, flat paper: a `Card` is a list's (`ListCard`) or a stat's.",
        });
        return;
      }
      if (name === "Panel") {
        if (!keys.some((key) => PADDINGS.has(key) || key === "borderRadius")) return;
        context.report({
          node: node.openingElement,
          message: "A panel pads 16px on a phone and 32px above, in the theme's corner: a `Panel` sets neither.",
        });
        return;
      }
      const component = attributeValue(attribute(node, "component"));
      const paper = name === "Paper" || (component?.type === "Identifier" && component.name === "Paper");
      const variant = attributeValue(attribute(node, "variant"));
      // A frame (an outlined paper) or a banner (a surface of its own) pads itself
      const outlined = variant?.type === "Literal" && variant.value === "outlined";
      if (!paper || outlined || !keys.some((key) => PADDINGS.has(key)) || keys.some((key) => SURFACES.has(key))) return;
      context.report({
        node: node.openingElement,
        message: "A panel is a `Panel` (`components/common`): flat paper, its padding and its corner the theme's.",
      });
    },
  };
}

function createRowActions(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/RowActions.tsx")) return {};
  return {
    JSXAttribute(node) {
      const value = attributeValue(node);
      if (node.name.name !== "className" || value?.type !== "Literal" || value.value !== "row-actions") return;
      context.report({
        node,
        message:
          "A row's actions are a `RowActions` of `RowAction`s (`components/common`): never a class of their own.",
      });
    },
    JSXElement(node) {
      const name = elementName(node);
      if (name === "RowActions" && !inHoverRow(node, context)) {
        context.report({
          node: node.openingElement,
          message:
            "A row's actions show on its hover: the row holding its `RowActions` spreads `ROW_ACTIONS_HOVER_SX` into " +
            "its `sx`.",
        });
      }
      if (name === "RowAction" || name === "RowActions" || !inRowActions(node)) return;
      context.report({
        node: node.openingElement,
        message:
          "A row's action is a `RowAction` (its icon, its label, its intent's color: grey, red for what destroys), " +
          "in its row's `RowActions`.",
      });
    },
  };
}

function createSectionHeadings(context) {
  if (!inClient(context)) return {};
  const owner =
    inFile(context, "client/src/components/common/SubsectionTitle.tsx") ||
    inFile(context, "client/src/components/common/EntryTitle.tsx");
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "Typography") {
        const component = attributeValue(attribute(node, "component"));
        if (owner || component?.type !== "Literal" || !SUBHEADING_LEVELS.has(component.value)) return;
        context.report({
          node: node.openingElement,
          message:
            "A heading under a card's title is a `SubsectionTitle`, and an entry's name in a panel's list an " +
            "`EntryTitle`: never a Typography of its own.",
        });
        return;
      }
      if (name !== "Stack" || !leadsWith(node, "SubsectionTitle") || isRow(node)) return;
      const spacing = attributeValue(attribute(node, "spacing"));
      if (spacing?.type === "Literal" && spacing.value === 1) return;
      context.report({
        node: node.openingElement,
        message: "A sub-heading sits 8px above its content: the column a `SubsectionTitle` leads takes `spacing={1}`.",
      });
    },
  };
}

function createSelectFields(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/FormFields.tsx")) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (!hasAttribute(node, "select") || (name !== "TextField" && name !== "FormTextField")) return;
      // A form's field's own ref (`field.ref`); a ref the component is handed is a custom input's, its owner binding it
      const ref = attributeValue(attribute(node, "inputRef"));
      const fieldRef = ref?.type === "MemberExpression" && !ref.computed && ref.property.name === "ref";
      const bound =
        name === "FormTextField" ||
        fieldRef ||
        node.openingElement.attributes.some((a) => a.type === "JSXSpreadAttribute");
      if (!bound) return;
      context.report({ node: node.openingElement, message: "A select bound to a form's field is a `SelectField`." });
    },
  };
}

function createSkeletons(context) {
  if (!inClient(context) || SKELETON_MODULES.has(repoPath(context.filename))) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Skeleton") return;
      let inCell = false;
      for (let p = parentElement(node); p; p = parentElement(p)) {
        const name = elementName(p);
        if (name === "TableCell") inCell = true;
        // A table drawn by hand as it loads: its header over rows of skeletons
        if (name !== "Table" || !holds(p, (child) => elementName(child) === "TableHead")) continue;
        context.report({ node: node.openingElement, message: "A table's first load is a `TableSkeleton`." });
        return;
      }
      // A table's rows that load on their own (an expanded group's) hold their place
      if (inCell) return;
      context.report({
        node: node.openingElement,
        message:
          "A skeleton means loading: a table's is a `TableSkeleton`, a page's its own (the sheet's, an entity " +
          "page's), anything else a section's `DiceSpinner`; what's empty or hidden says so in a `BlankNote`.",
      });
    },
  };
}

function createTableFrames(context) {
  if (!inClient(context)) return {};
  const ownFrame = inFile(context, "client/src/components/common/TableFrame.tsx");
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "TableContainer" && hasAttribute(node, "component") && !ownFrame) {
        context.report({
          node: node.openingElement,
          message: "A table on a page or in a dialog is framed by a `TableFrame`; a table in a panel stands bare.",
        });
        return;
      }
      if (!inTableHead(node)) return;
      const bold = name === "strong" || name === "b";
      const styled = styleProperties(attributeValue(attribute(node, "sx")), node).some((property) =>
        HEADER_STYLE_KEYS.has(propertyKey(property)),
      );
      if (!bold && !styled) return;
      context.report({
        node: node.openingElement,
        message:
          "The theme draws a table's header (its tint, its labels' weight and color): its cells set only their size.",
      });
    },
  };
}

function createToggleStates(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "IconButton") return;
      const label = attributeValue(attribute(node, "aria-label"));
      if (flips(label)) {
        context.report({
          node: node.openingElement,
          message:
            "A toggle keeps one label and says its state: `aria-pressed`, or `aria-expanded` when it shows or hides " +
            "something, never a label that flips (`Star` / `Unstar`).",
        });
        return;
      }
      if (!label || firstWord(label) !== "Toggle") return;
      if (hasAttribute(node, "aria-pressed") || hasAttribute(node, "aria-expanded")) return;
      context.report({
        node: node.openingElement,
        message:
          "A toggle names what it turns on and says its state: `aria-pressed`, or `aria-expanded` when it shows or " +
          "hides something.",
      });
    },
  };
}

/** The value the file's top declares for `name` (`const X = …`, exported or not), found from `node`, any node of it. */
function declaredValue(name, node) {
  let program = node;
  while (program.parent) program = program.parent;
  for (const statement of program.body) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    const found = declaration.declarations.find((d) => d.id.type === "Identifier" && d.id.name === name);
    if (found) return found.init;
  }
  return null;
}

/** Whether a text ends with a period: a string, a template's last part, or JSX text. */
function endsWithPeriod(node) {
  if (!node) return false;
  const text =
    node.type === "JSXText" || node.type === "Literal"
      ? node.value
      : node.type === "TemplateLiteral"
        ? node.quasis.at(-1).value.cooked
        : null;
  return typeof text === "string" && /\.\s*$/.test(text) && !/\.\.\.\s*$/.test(text);
}

/** The first word of a label written as a string or a template: `"Star ruleset"`'s `Star`. */
function firstWord(node) {
  const text =
    node.type === "Literal" ? node.value : node.type === "TemplateLiteral" ? node.quasis[0].value.cooked : "";
  return typeof text === "string" ? text.split(/\s/)[0] : "";
}

/** Whether a label flips between a state and its opposite: `open ? "Hide" : "Show"`, alone or opening a template. */
function flips(label) {
  const conditional =
    label?.type === "TemplateLiteral" && label.quasis[0].value.cooked === "" ? label.expressions[0] : label;
  return (
    conditional?.type === "ConditionalExpression" &&
    opposite(firstWord(conditional.consequent), firstWord(conditional.alternate))
  );
}

/** Whether an element holds, at any depth, an element `test` accepts: among its children, fragments and conditions. */
function holds(element, test) {
  return childElements(element).some((child) => test(child) || holds(child, test));
}

/** Whether an element holds a page's or a panel's title: a `CardTitle`, an `h1`. */
function holdsTitle(element) {
  return holds(element, (child) => {
    const component = attributeValue(attribute(child, "component"));
    return elementName(child) === "CardTitle" || (component?.type === "Literal" && component.value === "h1");
  });
}

/** Whether a text is a confirmation's own: a `ConfirmDialog`'s (`DeleteDialog`'s) `message`. */
function inConfirmation(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "JSXAttribute" && p.name.name === "message") return true;
    if (p.type === "JSXElement" && ["ConfirmDialog", "DeleteDialog"].includes(elementName(p))) return true;
  }
  return false;
}

/** Whether the linted file is `file`, the one module the rule leaves the raw pattern to. */
function inFile(context, file) {
  return repoPath(context.filename) === file;
}

/** Whether `node` sits in a row whose `sx` reveals its actions on hover (`ROW_ACTIONS_HOVER_SX`). */
function inHoverRow(node, context) {
  for (let p = parentElement(node); p; p = parentElement(p)) {
    const sx = attribute(p, "sx");
    if (sx && context.sourceCode.getText(sx).includes("ROW_ACTIONS_HOVER_SX")) return true;
  }
  return false;
}

/** Whether `node` is one of a row's actions: in a `RowActions`, or what a `renderActions` callback renders. */
function inRowActions(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "JSXElement") return elementName(p) === "RowActions";
    if (p.type === "JSXAttribute") return p.name.name === "renderActions";
  }
  return false;
}

/** Whether `node` sits in a table's header, a `TableHead`. */
function inTableHead(node) {
  for (let p = parentElement(node); p; p = parentElement(p)) if (elementName(p) === "TableHead") return true;
  return false;
}

/** Whether a `Stack` lays its children in a row, on any screen. */
function isRow(stack) {
  const direction = attributeValue(attribute(stack, "direction"));
  return !!direction && !(direction.type === "Literal" && direction.value === "column");
}

/** Whether an element's first child (text and comments aside) is the element `name`. */
function leadsWith(element, name) {
  const first = element.children.find(
    (child) =>
      child.type === "JSXElement" ||
      (child.type === "JSXExpressionContainer" && child.expression.type !== "JSXEmptyExpression"),
  );
  return first?.type === "JSXElement" && elementName(first) === name;
}

/** Whether two words name a state and its opposite: `Star` and `Unstar`, `Expand` and `Collapse`. */
function opposite(a, b) {
  if (!a || !b) return false;
  const pair = [a, b].sort().join(" ");
  return OPPOSITES.has(pair) || a === `Un${b.toLowerCase()}` || b === `Un${a.toLowerCase()}`;
}

/** The name a style property goes by, written as a name or a string; null for a computed one. */
function propertyKey(property) {
  if (property.type !== "Property" || property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  return typeof property.key.value === "string" ? property.key.value : null;
}

/**
 * The properties a style sets at its top: an object's, an array's (a condition's `cond && {…}` too), a spread's, and a
 * constant's the file declares (`COLUMN_HEADER_SX`), found from `node`, any node of the file.
 */
function styleProperties(expression, node) {
  if (!expression) return [];
  if (expression.type === "TSAsExpression") return styleProperties(expression.expression, node);
  if (expression.type === "LogicalExpression") return styleProperties(expression.right, node);
  if (expression.type === "ConditionalExpression")
    return [...styleProperties(expression.consequent, node), ...styleProperties(expression.alternate, node)];
  if (expression.type === "ArrayExpression") return expression.elements.flatMap((e) => styleProperties(e, node));
  if (expression.type === "Identifier") return styleProperties(declaredValue(expression.name, node), node);
  if (expression.type !== "ObjectExpression") return [];
  return expression.properties.flatMap((p) => (p.type === "SpreadElement" ? styleProperties(p.argument, node) : [p]));
}

export default {
  "add-buttons": { meta: { type: "suggestion" }, create: createAddButtons },
  "anchor-menus": { meta: { type: "suggestion" }, create: createAnchorMenus },
  "choice-chips": { meta: { type: "suggestion" }, create: createChoiceChips },
  "dialog-footers": { meta: { type: "suggestion" }, create: createDialogFooters },
  "expand-arrows": { meta: { type: "suggestion" }, create: createExpandArrows },
  "form-validation": { meta: { type: "suggestion" }, create: createFormValidation },
  "blank-notes": { meta: { type: "suggestion" }, create: createBlankNotes },
  "card-titles": { meta: { type: "suggestion" }, create: createCardTitles },
  "confirm-dialogs": { meta: { type: "suggestion" }, create: createConfirmDialogs },
  "empty-values": { meta: { type: "suggestion" }, create: createEmptyValues },
  "list-toolbars": { meta: { type: "suggestion" }, create: createListToolbars },
  "page-gaps": { meta: { type: "suggestion" }, create: createPageGaps },
  "page-loaders": { meta: { type: "suggestion" }, create: createPageLoaders },
  "page-titles": { meta: { type: "suggestion" }, create: createPageTitles },
  panels: { meta: { type: "suggestion" }, create: createPanels },
  "section-headings": { meta: { type: "suggestion" }, create: createSectionHeadings },
  "table-frames": { meta: { type: "suggestion" }, create: createTableFrames },
  "link-buttons": { meta: { type: "suggestion" }, create: createLinkButtons },
  "next-page-spinners": { meta: { type: "suggestion" }, create: createNextPageSpinners },
  "notification-messages": { meta: { type: "suggestion" }, create: createNotificationMessages },
  "option-tooltips": { meta: { type: "suggestion" }, create: createOptionTooltips },
  "row-actions": { meta: { type: "suggestion" }, create: createRowActions },
  "select-fields": { meta: { type: "suggestion" }, create: createSelectFields },
  skeletons: { meta: { type: "suggestion" }, create: createSkeletons },
  "toggle-states": { meta: { type: "suggestion" }, create: createToggleStates },
};
