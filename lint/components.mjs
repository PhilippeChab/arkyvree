/**
 * The client's shared components, each the one way to write its pattern (docs/frontend.md):
 *
 * - `dialog-footers`: a dialog's footer is a `DialogFooter` (its way out, then its own steps, then its action), never
 *   `DialogActions` written by hand; its action, the one contained button, is its `action`, never one of its steps.
 * - `add-buttons`: a button that adds something is an `AddButton`, never a `Button` given the add icon or the words.
 * - `confirm-dialogs`: a confirmation is a `ConfirmDialog` (`DeleteDialog`), over a page or over a dialog alike; a
 *   save's rules warnings are a `ValidationIssuesAlert`. No other alert carries actions, and no "Are you sure" is
 *   written by hand. One that sends a request closes in its mutation's `onSuccess`, never as it sends it.
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
 * - `card-titles`: a card's or a panel's title (an `h2` sized from `h6` up) is a `CardTitle`.
 * - `blank-notes`: an empty list's line ("No local changes") is a `BlankNote` in a panel, a dialog, a menu or the level
 *   wizard, and a page's or a tab's is a `BlankState`, its icon and its line required: never a `Typography` or an
 *   `Alert` of its own. A note (a `BlankNote`, a picker's `noOptionsText`) never ends with a period, and a sheet's says
 *   what the character has none of ("No skills"), never "available".
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
 * - `page-gaps`: a page starts 32px under the app bar, the theme padding its `Container` (an `sm` card, an invite's or
 *   an app's consent, keeps its own), a column of the app's page width, its default (the legal page's `md` and an `sm`
 *   card narrower); its content sits 32px under its header (the column holding the header takes `spacing={4}`), and a
 *   tab's 56px under its tabs, in a `SectionTabPanel`.
 * - `page-titles`: a page's title (its `h1`) is its header's: `PageHeader`, `DetailPageHeader`, or the header of a page
 *   that opens on its own (the dashboard, the auth pages, an invite, an app's consent).
 * - `list-toolbars`: a list's actions sit in its `ListToolbar` (`SearchBar` is one), or in a dialog across from its
 *   lead (`DialogLead`), or in a panel across from its title (`PanelLead`), never a bare row; the list sits 24px under
 *   its toolbar (`spacing={3}`), and its Load More 16px under the list (`spacing={2}`).
 * - `list-results`: a searched list's results, a page's or a tab's, show one way: `ListPageResults` (a tab's
 *   `variant="section"`), or a ruleset tab's `RulesetSectionTable`, each with its first load, its failure, the search
 *   that found nothing (`NoMatchesState`) and its empty state. No other module draws a `NoMatchesState`. A ruleset
 *   table that loads its pages (a `LoadMoreButton` beside it) staggers in the page that came in alone: its
 *   `animationOffset` is `itemsBeforeLastPage(data)`.
 * - `empty-values`: a value that isn't there is an `EmptyValue`, never a dash of its own, and a description that isn't
 *   there says `NO_DESCRIPTION`, never a sentence of its own.
 * - `row-actions`: a row's actions are a `RowActions` of `RowAction`s (`components/common`), in a row that spreads
 *   `ROW_ACTIONS_HOVER_SX`: never buttons of their own, nor a `row-actions` class written by hand.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import {
  attribute,
  attributeExpression,
  calleeName,
  childElements,
  elementName,
  hasAttribute,
  inClient,
  inFile,
  parentElement,
} from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/**
 * The alerts that carry an action: a save's rules warnings (Proceed Anyway), a load's failure (Retry) and a toast (the
 * new version's Refresh)
 */
const ACTION_ALERTS = [
  "client/src/components/characters/validation/ValidationIssuesAlert.tsx",
  "client/src/components/common/LoadError.tsx",
  "client/src/contexts/SnackbarProvider.tsx",
];
/** The confirmations, whose `onConfirm` sends what they ask */
const CONFIRMATIONS = new Set(["ConfirmDialog", "DeleteDialog", "EntityDeleteDialog"]);
/** How a row pushes what it holds to its end: a list's actions there sit in its toolbar instead */
const END_JUSTIFICATIONS = new Set(["flex-end", "space-between"]);

/** A list's own actions, which sit in its toolbar: its add button, a ruleset section's `SectionActions` */
const LIST_ACTIONS = new Set(["AddButton", "SectionActions"]);

/** The modules that show a searched list's results: its first load, its failure, its no matches, its empty state */
const LIST_RESULTS_OWNERS = new Set([
  "client/src/components/common/BlankState.tsx",
  "client/src/components/common/ListPageResults.tsx",
  "client/src/pages/rulesets/components/RulesetSectionTable.tsx",
]);

/** What sits above a list and holds its actions: its toolbar, its search's, or in a dialog its lead */
const LIST_TOOLBARS = new Set(["DialogLead", "ListToolbar", "SearchBar", "SectionSearchBar"]);

/** The words a missing description is said in, which `NO_DESCRIPTION` holds */
const NO_DESCRIPTION_WORDS = /^No description\b/;

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
  "client/src/components/auth/AuthPage.tsx",
  "client/src/components/common/DetailPageHeader.tsx",
  "client/src/components/common/PageHeader.tsx",
  "client/src/components/layout/ErrorBoundary.tsx",
  "client/src/pages/dashboard/DashboardPage.tsx",
  "client/src/pages/invites/InvitePage.tsx",
  "client/src/pages/oauth/ConsentPage.tsx",
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

/** Whether a call closes a dialog: `dialog.close()`, `onClose()`, `setDeleteOpen(false)`. */
function closesDialog(call) {
  const name = calleeName(call) ?? "";
  if (name === "close" || name === "onClose") return true;
  const [value] = call.arguments;
  return /^set\w*Open$/.test(name) && value?.type === "Literal" && value.value === false;
}

function createAddButtons(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/AddButton.tsx")) return {};
  const message = "A button that adds something is an `AddButton` (`components/common`).";
  return {
    JSXAttribute(node) {
      if (node.name.name !== "startIcon") return;
      const value = attributeExpression(node);
      if (value?.type !== "JSXElement" || elementName(value) !== "AddIcon") return;
      context.report({ node, message });
    },
    // A button whose words add ("Add Item"), without the add icon (with it, its `startIcon` says so)
    JSXElement(node) {
      const icon = attributeExpression(attribute(node, "startIcon"));
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
      const value = attributeExpression(node);
      if (node.name.name === "noOptionsText" && endsWithPeriod(value)) period(node);
    },
    JSXElement(node) {
      if (elementName(node) !== "BlankNote") return;
      const last = node.children.findLast((child) => child.type !== "JSXText" || child.value.trim());
      const text = last?.type === "JSXExpressionContainer" ? last.expression : last;
      if (endsWithPeriod(text)) period(node.openingElement);
      // A sheet says what the character has none of ("No skills"): nothing on it is to pick from
      const sheet = repoPath(context.filename).startsWith("client/src/components/characters/");
      if (sheet && last?.type === "JSXText" && /\bavailable\s*$/.test(last.value)) {
        context.report({
          node: node.openingElement,
          message: 'A sheet says what the character has none of ("No skills", "No equipment"), never "available".',
        });
      }
    },
    JSXText(node) {
      if (!/^\s*No\s+\w/.test(node.value) || !["Alert", "Typography"].includes(elementName(parentElement(node))))
        return;
      context.report({
        node,
        message:
          "An empty list says so with a `BlankNote` (a panel's, a dialog's, a menu's, the advancement wizard's) or a " +
          "`BlankState` (a page's or a tab's).",
      });
    },
  };
}

function createCardTitles(context) {
  if (!inClient(context) || inFile(context, "client/src/components/common/CardTitle.tsx")) return {};
  return {
    JSXElement(node) {
      const component = attributeExpression(attribute(node, "component"));
      if (elementName(node) !== "Typography" || component?.type !== "Literal" || component.value !== "h2") return;
      const sized = styleProperties(attributeExpression(attribute(node, "sx")), node).some(
        (property) => propertyKey(property) === "typography" && property.value.type === "ObjectExpression",
      );
      if (sized)
        context.report({ node: node.openingElement, message: "A card's or a panel's title is a `CardTitle`." });
    },
  };
}

function createConfirmDialogs(context) {
  if (!inClient(context) || ACTION_ALERTS.some((file) => inFile(context, file))) return {};
  return {
    JSXElement(node) {
      if (!["Alert", "AnimatedAlert"].includes(elementName(node)) || !hasAttribute(node, "action")) return;
      context.report({
        node: node.openingElement,
        message:
          "A confirmation is a `ConfirmDialog`, over a dialog too, and a save's rules warnings a " +
          "`ValidationIssuesAlert`: no other alert carries actions.",
      });
    },
    // Closed as it sends, a confirmation hides the request's failure, and its retry
    JSXAttribute(node) {
      if (node.name.name !== "onConfirm" || !CONFIRMATIONS.has(elementName(node.parent.parent))) return;
      const handler = attributeExpression(node);
      if (handler?.type !== "ArrowFunctionExpression" && handler?.type !== "FunctionExpression") return;
      const calls = handler.body.type === "CallExpression" ? [handler.body] : statementCalls(handler.body);
      const closer = calls.some((call) => calleeName(call) === "mutate") && calls.find(closesDialog);
      if (!closer) return;
      context.report({
        node: closer,
        message:
          "A confirmation that sends a request closes in its mutation's `onSuccess` (`mutate(x, { onSuccess })`): " +
          "a failure keeps it open, its toast saying why.",
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
      const variant = attributeExpression(attribute(node, "variant"));
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
      const component = attributeExpression(attribute(node, "component"));
      const asForm = component?.type === "Literal" && component.value === "form";
      if (raw || asForm) {
        if (hasAttribute(node, "noValidate")) return;
        context.report({
          node: node.openingElement,
          message: "A form is `noValidate`: its rules check its fields and say why, never the browser.",
        });
        return;
      }
      const type = attributeExpression(attribute(node, "type"));
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
      const rules = attributeExpression(attribute(field, "rules"));
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

function createListResults(context) {
  if (!inClient(context) || LIST_RESULTS_OWNERS.has(repoPath(context.filename))) return {};
  return {
    JSXElement(node) {
      // A ruleset table that loads its pages (its Load More beside it) staggers in the page that came in alone
      const children = childElements(node);
      const pagedTable = children.find((child) => elementName(child) === "RulesetSectionTable");
      if (
        pagedTable &&
        children.some((child) => elementName(child) === "LoadMoreButton") &&
        !hasAttribute(pagedTable, "animationOffset")
      ) {
        context.report({
          node: pagedTable.openingElement,
          message:
            "A ruleset table that loads its pages staggers in the page that came in: its `animationOffset` is " +
            "`itemsBeforeLastPage(data)`, or a page loaded with Load More waits for every row before it.",
        });
      }
      if (elementName(node) !== "NoMatchesState") return;
      context.report({
        node: node.openingElement,
        message:
          "A searched list's results show one way: `ListPageResults` (a tab's `variant=\"section\"`) or a ruleset " +
          "tab's `RulesetSectionTable`, whose search that found nothing is theirs: no `NoMatchesState` of its own.",
      });
    },
  };
}

function createListToolbars(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) === "ListToolbar" && inDialog(node)) {
        context.report({
          node: node.openingElement,
          message:
            "A dialog holds one list: its actions sit across from its lead, `DialogLead`'s `actions`, never in a " +
            "`ListToolbar`, a page's bar.",
        });
      }
      if (elementName(node) === "ListToolbar" && inPanel(node)) {
        context.report({
          node: node.openingElement,
          message:
            "A panel holds one list: its actions sit across from its title, `PanelLead`'s `actions`, never in a " +
            "`ListToolbar`, a page's bar.",
        });
      }
      if (elementName(node) !== "Stack") return;
      const children = childElements(node).map(elementName);
      const spacing = attributeExpression(attribute(node, "spacing"));
      const spaced = (units) => spacing?.type === "Literal" && spacing.value === units;
      if (children.some((child) => LIST_TOOLBARS.has(child)) && !spaced(3)) {
        context.report({
          node: node.openingElement,
          message:
            "A list sits 24px under its toolbar: the column holding a `ListToolbar` (`SearchBar`, `DialogLead`) takes " +
            "`spacing={3}`.",
        });
      }
      if (children.includes("LoadMoreButton") && !spaced(2)) {
        context.report({
          node: node.openingElement,
          message: "Load More sits 16px under its list: the column holding a `LoadMoreButton` takes `spacing={2}`.",
        });
      }
      // A row that pushes its actions to its end: alone, or across from a line of its own (a dialog's lead)
      const endAligned = styleProperties(attributeExpression(attribute(node, "sx")), node).some(
        (property) =>
          propertyKey(property) === "justifyContent" &&
          property.value.type === "Literal" &&
          END_JUSTIFICATIONS.has(property.value.value),
      );
      if (!isRow(node) || !endAligned || !children.some((child) => LIST_ACTIONS.has(child))) return;
      context.report({
        node: node.openingElement,
        message:
          "A list's actions sit in its toolbar, a `ListToolbar`'s `actions` (in a dialog, `DialogLead`'s): never a bare " +
          "row of their own.",
      });
    },
  };
}

function createPageGaps(context) {
  if (!inClient(context)) return {};
  const tabPanelModule = inFile(context, "client/src/components/common/SectionTabs.tsx");
  return {
    JSXElement(node) {
      const name = elementName(node);
      const role = attributeExpression(attribute(node, "role"));
      if (role?.type === "Literal" && role.value === "tabpanel" && !tabPanelModule) {
        context.report({
          node: node.openingElement,
          message: "A record page's tab panel is a `SectionTabPanel`: its content 56px under the tabs.",
        });
        return;
      }
      if (name === "Container") {
        // An `sm` card (an invite's, an app's consent) stands alone in its column, centred, deeper than a page's content
        const maxWidth = attributeExpression(attribute(node, "maxWidth"));
        if (maxWidth?.type === "Literal" && maxWidth.value === "sm") return;
        // The app's page width is a Container's own (`lg`, which `AppMain` caps every page at): narrower for reading
        if (maxWidth && !(maxWidth.type === "Literal" && maxWidth.value === "md")) {
          context.report({
            node: node.openingElement,
            message:
              "A page's column is a `Container` of the app's page width, its default (`AppMain` caps every page " +
              'there): no `maxWidth` but the legal page\'s `"md"` and an invite\'s `"sm"`.',
          });
          return;
        }
        const properties = styleProperties(attributeExpression(attribute(node, "sx")), node);
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
      const spacing = attributeExpression(attribute(node, "spacing"));
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
      const size = attributeExpression(attribute(node, "size"));
      const properties = styleProperties(attributeExpression(attribute(node, "sx")), node);
      const large = size?.type === "Literal" && size.value === "large" && !skeleton;
      // A section's or a dialog's spinner: `py: 4` alone; a small one, a menu's or a popover's line: `py: 1.5` alone
      const spacing = size?.type === "Literal" && size.value === "small" ? 1.5 : 4;
      const styled =
        !ownLoader &&
        properties.some(
          (property) =>
            propertyKey(property) !== "py" || property.value.type !== "Literal" || property.value.value !== spacing,
        );
      if (!large && !styled) return;
      context.report({
        node: node.openingElement,
        message:
          "A page's first load is a `PageLoader` (the character sheet draws its skeleton); a section's or a " +
          "dialog's spinner takes a section's spacing (`sx={{ py: 4 }}`) and nothing else, a menu's or a popover's " +
          'the small die on a line\'s (`size="small" sx={{ py: 1.5 }}`), never the large size.',
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
      const value = attributeExpression(node);
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
      const properties = styleProperties(attributeExpression(attribute(node, "sx")), node);
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
      const component = attributeExpression(attribute(node, "component"));
      const paper = name === "Paper" || (component?.type === "Identifier" && component.name === "Paper");
      const variant = attributeExpression(attribute(node, "variant"));
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
      const value = attributeExpression(node);
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
    inFile(context, "client/src/components/characters/sections/EntryTitle.tsx");
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "Typography") {
        const component = attributeExpression(attribute(node, "component"));
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
      const spacing = attributeExpression(attribute(node, "spacing"));
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
      const ref = attributeExpression(attribute(node, "inputRef"));
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
        if (name === "DataCell") inCell = true;
        // A table drawn by hand as it loads: a `DataTable`'s columns over rows of skeletons
        if (name !== "DataTable" || !hasAttribute(p, "columns")) continue;
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

function createToggleStates(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "IconButton") return;
      const label = attributeExpression(attribute(node, "aria-label"));
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
    const component = attributeExpression(attribute(child, "component"));
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

/** Whether `node` sits in a dialog's content, a `DialogContent`. */
function inDialog(node) {
  for (let p = parentElement(node); p; p = parentElement(p)) if (elementName(p) === "DialogContent") return true;
  return false;
}

/** Whether `node` sits in a row whose `sx` reveals its actions on hover (`ROW_ACTIONS_HOVER_SX`). */
function inHoverRow(node, context) {
  for (let p = parentElement(node); p; p = parentElement(p)) {
    const sx = attribute(p, "sx");
    if (sx && context.sourceCode.getText(sx).includes("ROW_ACTIONS_HOVER_SX")) return true;
  }
  return false;
}

/** Whether `node` sits in a `Panel`, a page's panel, whose list's actions sit across from its title (`PanelLead`). */
function inPanel(node) {
  for (let p = parentElement(node); p; p = parentElement(p)) if (elementName(p) === "Panel") return true;
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

/** Whether a `Stack` lays its children in a row, on any screen. */
function isRow(stack) {
  const direction = attributeExpression(attribute(stack, "direction"));
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

/** The calls a block makes as its statements, its conditions' too, in order; what its nested functions call aside. */
function statementCalls(node) {
  if (!node) return [];
  if (node.type === "ExpressionStatement") return node.expression.type === "CallExpression" ? [node.expression] : [];
  if (node.type === "BlockStatement") return node.body.flatMap(statementCalls);
  if (node.type === "IfStatement") return [...statementCalls(node.consequent), ...statementCalls(node.alternate)];
  return [];
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
  "dialog-footers": { meta: { type: "suggestion" }, create: createDialogFooters },
  "expand-arrows": { meta: { type: "suggestion" }, create: createExpandArrows },
  "form-validation": { meta: { type: "suggestion" }, create: createFormValidation },
  "blank-notes": { meta: { type: "suggestion" }, create: createBlankNotes },
  "card-titles": { meta: { type: "suggestion" }, create: createCardTitles },
  "confirm-dialogs": { meta: { type: "suggestion" }, create: createConfirmDialogs },
  "empty-values": { meta: { type: "suggestion" }, create: createEmptyValues },
  "list-results": { meta: { type: "suggestion" }, create: createListResults },
  "list-toolbars": { meta: { type: "suggestion" }, create: createListToolbars },
  "page-gaps": { meta: { type: "suggestion" }, create: createPageGaps },
  "page-loaders": { meta: { type: "suggestion" }, create: createPageLoaders },
  "page-titles": { meta: { type: "suggestion" }, create: createPageTitles },
  panels: { meta: { type: "suggestion" }, create: createPanels },
  "section-headings": { meta: { type: "suggestion" }, create: createSectionHeadings },
  "row-actions": { meta: { type: "suggestion" }, create: createRowActions },
  "select-fields": { meta: { type: "suggestion" }, create: createSelectFields },
  skeletons: { meta: { type: "suggestion" }, create: createSkeletons },
  "toggle-states": { meta: { type: "suggestion" }, create: createToggleStates },
};
