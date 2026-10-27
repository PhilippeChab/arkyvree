import type { LinkRoleDef, StorageDeclaration } from "@/engine/core/module/index.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { ITEM_IS_TEMPLATE } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * 3.5's kinds, past their fields (which its vocabulary declares, `ENTITY_FIELDS`): what a new class or race is for by
 * default (`pc`), which kinds a user customizes and how their namesakes pair, and what makes an item a template.
 */
const KINDS: StorageDeclaration["kinds"] = {
  abilities: {},
  aptitudes: { namesakes: "identity" },
  feats: { customizable: true, namesakes: "reprints" },
  items: { customizable: true, template: ITEM_IS_TEMPLATE },
  classes: { customizable: true, editedLinks: "classSkill", partition: PLAYER_CHARACTER_KIND },
  "class-levels": { customizable: true },
  languages: {},
  mechanics: {},
  spells: { customizable: true, namesakes: "reprints" },
  races: { customizable: true, partition: PLAYER_CHARACTER_KIND },
  saves: {},
  skills: {},
};

/**
 * 3.5's link roles, each with how its sibling copies merge it: a feat's or a spell's lists hold every copy's
 * (`union`), and every single link (with the fields it's read by: an item's template, a spell's save with its save
 * effect, a class's bonus spell ability) and a link of a role the winning copy holds many of (a class's skills, a class
 * level's grants and base bonuses) is the winning copy's alone (`winner`). A link through a pool goes with its pool
 * (`viaOnDelete`). Its single roles type the view's entities' (`SingleRolesOf`).
 */
// oxfmt-ignore
export const LINK_ROLES = [
  { role: "subraceOf", fromType: "races", toType: "races", viaType: null, single: true, onDelete: "delete", viaOnDelete: "refuse", merge: "winner" },
  { role: "subclassOf", fromType: "classes", toType: "classes", viaType: null, single: true, onDelete: "delete", viaOnDelete: "refuse", merge: "winner" },
  { role: "madeFrom", fromType: "items", toType: "items", viaType: null, single: true, onDelete: "refuse", viaOnDelete: "refuse", merge: "winner" },
  { role: "listedIn", fromType: "feats", toType: "aptitudes", viaType: null, single: false, onDelete: "unlink", viaOnDelete: "refuse", merge: "union" },
  { role: "listedIn", fromType: "spells", toType: "aptitudes", viaType: null, single: false, onDelete: "unlink", viaOnDelete: "refuse", merge: "union" },
  { role: "classSkill", fromType: "classes", toType: "skills", viaType: null, single: false, onDelete: "unlink", viaOnDelete: "refuse", merge: "winner" },
  { role: "grants", fromType: "class-levels", toType: "feats", viaType: "aptitudes", single: false, onDelete: "unlink", viaOnDelete: "unlink", merge: "winner" },
  { role: "grants", fromType: "class-levels", toType: "spells", viaType: "aptitudes", single: false, onDelete: "unlink", viaOnDelete: "unlink", merge: "winner" },
  { role: "baseBonus", fromType: "class-levels", toType: "saves", viaType: null, single: false, onDelete: "refuse", viaOnDelete: "refuse", merge: "winner" },
  { role: "keyAbility", fromType: "saves", toType: "abilities", viaType: null, single: true, onDelete: "delete", viaOnDelete: "refuse", merge: "winner" },
  { role: "keyAbility", fromType: "skills", toType: "abilities", viaType: null, single: true, onDelete: "delete", viaOnDelete: "refuse", merge: "winner" },
  { role: "resistedBy", fromType: "spells", toType: "saves", viaType: null, single: true, onDelete: "unlink", viaOnDelete: "refuse", merge: "winner" },
  { role: "bonusSpellAbility", fromType: "classes", toType: "abilities", viaType: null, single: true, onDelete: "unlink", viaOnDelete: "refuse", merge: "winner" },
] as const satisfies readonly LinkRoleDef[];

/**
 * How 3.5 stores its data in the generic tables: its kinds (`KINDS`), its characters' (its links of the `score` role
 * hold an amount; its identity is its `CHARACTER_*` fields, its race a `race` link, a level an advancement, its feats
 * `feats` picks), and its registries' rows, which every migrate writes (`StoredRegistries.reconcile`;
 * `tests/database/dnd3.5/registries.test.ts` checks the database holds them; its fields' the engine derives from its
 * vocabulary's declarations): its link roles, by which its entities' links are read (an item's template is its
 * `madeFrom` link, a class's bonus spell ability its `bonusSpellAbility` link, a feat's pools its `listedIn` links, a
 * class's skills its `classSkill` links); a ruleset's skill point ability is its `skillPointAbility` link.
 */
export const DND35_STORAGE: StorageDeclaration = {
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
        "races",
        "languages",
        "classes",
        "aptitudes",
        "mechanics",
      ].map((type) => ({ type, ownerType: null })),
      { type: "class-levels", ownerType: "classes" },
    ],
    linkRoles: [...LINK_ROLES],
    rulesetRoles: [{ role: "skillPointAbility", toType: "abilities", onDelete: "unlink" }],
    characterRoles: [
      { role: "race", entityType: "races", single: true, onDelete: "refuse" },
      { role: "score", entityType: "abilities", single: false, onDelete: "delete" },
      { role: "speaks", entityType: "languages", single: false, onDelete: "refuse" },
    ],
    steps: [
      { step: "hp", entityType: null, viaType: null, onDelete: "refuse", repeats: false },
      { step: "abilities", entityType: "abilities", viaType: null, onDelete: "delete", repeats: false },
      { step: "skills", entityType: "skills", viaType: null, onDelete: "refuse", repeats: false },
      { step: "feats", entityType: "feats", viaType: "aptitudes", onDelete: "refuse", repeats: true },
      { step: "spells", entityType: "spells", viaType: "aptitudes", onDelete: "refuse", repeats: false },
    ],
    itemTypes: ["items"],
  },
};
