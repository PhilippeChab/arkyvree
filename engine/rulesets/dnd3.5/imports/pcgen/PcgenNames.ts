import type { RulesetData } from "@/engine/core/view/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";

import { PCGEN_FEATS, PCGEN_ITEMS } from "./names.ts";

/** An entity of the view a name finds: its id, its name, and what it's for (`partition`: a race's, a class's `pc`). */
interface Named {
  id: string;
  name: string;
  partition: string;
}

/** A list's entities, each with its compared name, in the view's order: what a scan of the list reads. */
type Compared = { compared: string; entity: Named }[];

/** The view's lists an import finds entities in. */
type List = "feats" | "items" | "klasses" | "languages" | "races" | "skills" | "spells";

/** The lists an import finds a player's entity in alone: a race or a class a creature takes isn't a character's. */
const PLAYER_LISTS = new Set<List>(["klasses", "races"]);

/**
 * The view's entities found by the names PCGen gives them, in the picked ruleset (a custom ruleset's own classes and
 * items are found): a name compared without case, accents, spaces or punctuation, through the name table (`names.ts`)
 * and the ways PCGen and the app word one name: PCGen's "Base (Kind/More)" is the app's "Kind Base", "Base, kind
 * (more)" or "Base of Kind" ("Sword (Bastard)" the "Bastard Sword", "Rope (Hempen/50 Ft.)" the "Rope, hempen (50
 * ft.)"), and an app's name that ends on what an item holds ("Backpack (empty)") found by its name before it. Each
 * list's names are compared once, as it's first read.
 */
export default class PcgenNames {
  constructor(private readonly rulesetData: RulesetData) {}

  /** A name without the parenthesis it ends on ("Elf (Gray)": "Elf"), as it is when it ends on none. */
  private static base(name: string) {
    const open = name.lastIndexOf(" (");
    if (open < 0 || !name.endsWith(")") || name.slice(open + 2, -1).includes(")")) return name;
    return name.slice(0, open);
  }

  /** A name as names are compared: lower case, without accents, spaces or punctuation. */
  private static compared(name: string) {
    // Accents dropped with their marks, any script's letters kept
    return name
      .normalize("NFD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}+]/gu, "");
  }

  /**
   * The ways the app may word a name PCGen words "Base (Kind/More)": as it is, "Kind More Base", "Base, kind (more)",
   * "Base, kind more" and "Base of Kind"; a name without parentheses only as it is.
   */
  private static wordings(name: string): string[] {
    // Its first " (" past its first character, when it ends on ")": found without a pattern that backtracks
    const trimmed = name.trim();
    const open = trimmed.indexOf(" (", 1);
    if (open < 0 || !trimmed.endsWith(")") || trimmed.length - 1 <= open + 2) return [name];
    const base = trimmed.slice(0, open);
    const inner = trimmed.slice(open + 2, -1);
    const [kind, ...more] = inner.split("/");
    const rest = more.join(" ");
    return [
      name,
      `${[kind, ...more].join(" ")} ${base}`,
      `${kind} ${base}`,
      rest ? `${base}, ${kind} (${rest})` : `${base}, ${kind}`,
      `${base}, ${inner.replaceAll("/", " ")}`,
      `${base} of ${inner}`,
    ];
  }

  /** Each list's entities with their compared names, once read. */
  private readonly compares = new Map<List, Compared>();

  /** Each list's entities by their compared name (and an item's by its name before a closing parenthesis too). */
  private readonly indexes = new Map<List, Map<string, Named>>();

  /** A list's entities with their compared names, in the view's order: a player's alone of a race's or a class's. */
  private comparedOf(list: List): Compared {
    const cached = this.compares.get(list);
    if (cached) return cached;
    const entities: Named[] = Dnd35View.of(this.rulesetData)[list];
    const players = PLAYER_LISTS.has(list)
      ? entities.filter((entity) => entity.partition === PLAYER_CHARACTER_KIND)
      : entities;
    const compared = players.map((entity) => ({ compared: PcgenNames.compared(entity.name), entity }));
    this.compares.set(list, compared);
    return compared;
  }

  /** The first of `names` the list has an entity of. */
  private findFirst(list: List, names: string[]): Named | undefined {
    const index = this.indexOf(list);
    for (const name of names) {
      const found = index.get(PcgenNames.compared(name));
      if (found) return found;
    }
    return undefined;
  }

  /**
   * A list's entities by their compared name, the first of a name kept (the view lists a ruleset's own before what it
   * inherits); an item also by its name before a parenthesis it ends on, when no item has that name.
   */
  private indexOf(list: List): Map<string, Named> {
    const cached = this.indexes.get(list);
    if (cached) return cached;
    const index = new Map<string, Named>();
    for (const { compared, entity } of this.comparedOf(list)) if (!index.has(compared)) index.set(compared, entity);
    if (list === "items") {
      for (const { entity } of this.comparedOf(list)) {
        const key = PcgenNames.compared(PcgenNames.base(entity.name));
        if (!index.has(key)) index.set(key, entity);
      }
    }
    this.indexes.set(list, index);
    return index;
  }

  /**
   * The player race PCGen's subrace (`name`) is a kind of: the one its name before a parenthesis names ("Elf (Drow)":
   * "Elf"), none when it ends on none.
   */
  findBaseRace(name: string) {
    const base = PcgenNames.base(name);
    return base === name ? undefined : this.findFirst("races", [base]);
  }

  /** The class PCGen names `name`, a player's. */
  findClass(name: string) {
    const found = this.findFirst("klasses", [name]);
    return found && Dnd35View.of(this.rulesetData).klassesById.get(found.id);
  }

  /**
   * The feat PCGen names `name` taken with `choice` (`Weapon Focus` of `Sword (Bastard)`: the app's "Weapon Focus:
   * Bastard Sword"; `Skill Focus` of `Perform ~ Sing`: "Skill Focus: Perform"), or by its name alone when the ruleset keeps it whole (Spell Mastery); a class's feat PCGen names
   * "Class ~ Feat" by the app's that opens on "Feat (" and names the class.
   */
  findFeat(name: string, choice?: string) {
    const named = PCGEN_FEATS.get(name) ?? name;
    // A choice is an item's (Weapon Focus) or a skill's (Skill Focus), each as PCGen names it
    const choices = choice
      ? [PCGEN_ITEMS.get(choice), ...PcgenNames.wordings(choice), this.findSkill(choice)?.name]
      : [];
    const wordings = choices.filter((wording) => wording !== undefined).map((wording) => `${named}: ${wording}`);
    // A feat the ruleset keeps whole whatever its choice (Spell Mastery) is found by its name
    const found = this.findFirst("feats", [...wordings, named]);
    if (found || !name.includes(" ~ ")) return found;
    const [klass, feat] = name.split(" ~ ").map((part) => PcgenNames.compared(part));
    if (!klass || !feat) return undefined;
    return this.comparedOf("feats").find(
      ({ compared, entity }) => entity.name.includes(" (") && compared.startsWith(feat) && compared.includes(klass),
    )?.entity;
  }

  /** The item PCGen names `name`, through the name table and its wordings. */
  findItem(name: string) {
    return this.findFirst(
      "items",
      [PCGEN_ITEMS.get(name), ...PcgenNames.wordings(name)].filter((n) => n !== undefined),
    );
  }

  /** The language PCGen names `name`. */
  findLanguage(name: string) {
    return this.findFirst("languages", [name]);
  }

  /** The player race PCGen names `name`, through its wordings ("Elf (Gray)": "Gray Elf"). */
  findRace(name: string) {
    return this.findFirst("races", PcgenNames.wordings(name));
  }

  /**
   * The skill PCGen names `name`: by its name, or the one whose name it opens ("Knowledge (Nobility)": "Knowledge
   * (Nobility and Royalty)"), or a subtype's base ("Craft (Weaponsmithing)": "Craft") when the ruleset has no subtypes.
   * PCGen 6 names a subtype "Base ~ Subtype" ("Craft ~ Weaponsmithing"), read as "Base (Subtype)".
   */
  findSkill(pcgenName: string) {
    const tilde = pcgenName.indexOf(" ~ ", 1);
    const name = tilde < 0 ? pcgenName : `${pcgenName.slice(0, tilde)} (${pcgenName.slice(tilde + 3)})`;
    const found = this.findFirst("skills", [name]);
    if (found) return found;
    const wanted = PcgenNames.compared(name);
    // A name that compares to nothing (punctuation alone) opens every skill's: it finds none of them
    const opened = wanted
      ? this.comparedOf("skills").find(({ compared }) => compared.startsWith(wanted))?.entity
      : undefined;
    return opened ?? this.findFirst("skills", [PcgenNames.base(name)]);
  }

  /** The spells PCGen names `name`, among the ruleset's own (an import never makes one): two lists may each have one. */
  findSpells(name: string): Named[] {
    const compared = PcgenNames.compared(name);
    if (!compared) return [];
    return this.comparedOf("spells").flatMap((spell) => (spell.compared === compared ? [spell.entity] : []));
  }
}
