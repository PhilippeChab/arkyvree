import type { LinkRoleDef, StorageDeclaration } from "@/engine/core/module/index.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd5.2/characterKinds.ts";
import { ITEM_IS_TEMPLATE } from "@/vocabulary/dnd5.2/fields/index.ts";

/**
 * The D&D 5th Edition kinds, past their fields (which its vocabulary declares, `ENTITY_FIELDS`): what a new class or
 * species is for by default (`pc`), which kinds a user customizes and how their namesakes pair, and what makes an item
 * a template.
 */
const KINDS: StorageDeclaration["kinds"] = {
  abilities: {},
  aptitudes: { namesakes: "identity" },
  backgrounds: { customizable: true },
  feats: { customizable: true, namesakes: "reprints" },
  items: { customizable: true, template: ITEM_IS_TEMPLATE },
  classes: { customizable: true, partition: PLAYER_CHARACTER_KIND },
  "class-levels": { customizable: true },
  languages: {},
  mechanics: {},
  spells: { customizable: true, namesakes: "reprints" },
  species: { customizable: true, partition: PLAYER_CHARACTER_KIND },
  saves: {},
  skills: {},
};

/**
 * The D&D 5th Edition link roles, each with how its sibling copies merge it: a feat's or a spell's lists hold every
 * copy's (`union`), and every single link (with the fields it's read by: an item's template, a spell's save, a class's
 * spellcasting ability and starting proficiencies) and a link of a role the winning copy holds many of (a class
 * level's grants, a background's abilities) is the winning copy's alone (`winner`). A link through a pool goes with its
 * pool (`viaOnDelete`). Its single roles type the view's entities' (`SingleRolesOf`).
 */
// oxfmt-ignore
export const LINK_ROLES = [
  { role: "subspeciesOf", fromType: "species", toType: "species", viaType: null, single: true, onDelete: "delete", viaOnDelete: "refuse", merge: "winner" },
  { role: "madeFrom", fromType: "items", toType: "items", viaType: null, single: true, onDelete: "refuse", viaOnDelete: "refuse", merge: "winner" },
  { role: "listedIn", fromType: "feats", toType: "aptitudes", viaType: null, single: false, onDelete: "unlink", viaOnDelete: "refuse", merge: "union" },
  { role: "listedIn", fromType: "spells", toType: "aptitudes", viaType: null, single: false, onDelete: "unlink", viaOnDelete: "refuse", merge: "union" },
  { role: "grants", fromType: "class-levels", toType: "feats", viaType: "aptitudes", single: false, onDelete: "unlink", viaOnDelete: "unlink", merge: "winner" },
  { role: "grants", fromType: "class-levels", toType: "spells", viaType: "aptitudes", single: false, onDelete: "unlink", viaOnDelete: "unlink", merge: "winner" },
  { role: "keyAbility", fromType: "saves", toType: "abilities", viaType: null, single: true, onDelete: "delete", viaOnDelete: "refuse", merge: "winner" },
  { role: "keyAbility", fromType: "skills", toType: "abilities", viaType: null, single: true, onDelete: "delete", viaOnDelete: "refuse", merge: "winner" },
  { role: "resistedBy", fromType: "spells", toType: "saves", viaType: null, single: true, onDelete: "unlink", viaOnDelete: "refuse", merge: "winner" },
  { role: "spellcastingAbility", fromType: "classes", toType: "abilities", viaType: null, single: true, onDelete: "unlink", viaOnDelete: "refuse", merge: "winner" },
  { role: "startingProficiencies", fromType: "classes", toType: "feats", viaType: null, single: true, onDelete: "unlink", viaOnDelete: "refuse", merge: "winner" },
  { role: "multiclassProficiencies", fromType: "classes", toType: "feats", viaType: null, single: true, onDelete: "unlink", viaOnDelete: "refuse", merge: "winner" },
] as const satisfies readonly LinkRoleDef[];

/**
 * How D&D 5th Edition stores its data in the generic tables: its kinds (`KINDS`), its characters' (its links of the
 * `score` role hold an amount; its identity is its `CHARACTER_*` fields, its species a `species` link and its
 * background a `background` link, a level an advancement, its feats `feats` picks and its spells `spells` picks), and
 * its registries' rows, which every migrate writes (`StoredRegistries.reconcile`; `tests/database/registries.test.ts`
 * checks the database holds them): its link roles, by which its entities' links are read (an item's template is its
 * `madeFrom` link, a class's spellcasting ability its `spellcastingAbility` link, its starting proficiencies its
 * `startingProficiencies` and `multiclassProficiencies` links, a feat's pools its `listedIn` links). Its fields' rows
 * are the engine's, derived from its vocabulary's declarations. A level's steps are its hit points, its feats (a
 * class's features, its skill and subclass picks, its feats proper) and its spells: no ability increase or skill point
 * is a step of its own, a feat's.
 */
export const DND52_STORAGE: StorageDeclaration = {
  kinds: KINDS,
  character: { playerKind: PLAYER_CHARACTER_KIND, scoredRoles: ["score"] },
  registries: {
    entityTypes: [
      ...[
        "abilities",
        "saves",
        "skills",
        "feats",
        "spells",
        "items",
        "species",
        "backgrounds",
        "languages",
        "classes",
        "aptitudes",
        "mechanics",
      ].map((type) => ({ type, ownerType: null })),
      { type: "class-levels", ownerType: "classes" },
    ],
    linkRoles: [...LINK_ROLES],
    rulesetRoles: [],
    characterRoles: [
      { role: "species", entityType: "species", single: true, onDelete: "refuse" },
      { role: "background", entityType: "backgrounds", single: true, onDelete: "refuse" },
      { role: "score", entityType: "abilities", single: false, onDelete: "delete" },
      { role: "speaks", entityType: "languages", single: false, onDelete: "refuse" },
    ],
    steps: [
      { step: "hp", entityType: null, viaType: null, onDelete: "refuse", repeats: false },
      { step: "feats", entityType: "feats", viaType: "aptitudes", onDelete: "refuse", repeats: true },
      { step: "spells", entityType: "spells", viaType: "aptitudes", onDelete: "refuse", repeats: false },
    ],
    itemTypes: ["items"],
  },
};
