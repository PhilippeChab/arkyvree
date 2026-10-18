import type {
  ImportedCharacter,
  ImportedFeat,
  ImportedGear,
  ImportedLevel,
  ImportedSkill,
  SourceLine,
} from "@/engine/core/imports/imported.ts";

import PcgLine from "./PcgLine.ts";

/** An equipment set's line: where an item of the set the character uses is (`location`), and how many. */
interface EquipSetEntry {
  location: string;
  quantity: number;
}

/** A tag's reading: what a line named for it adds to the character. */
type TagReader = (line: PcgLine) => void;

/** The locations of an equipment set that hold an item without wearing it: what's carried, a container's by its name. */
const CARRIED_LOCATIONS = new Set(["Carried", "Equipped", "Not Carried"]);

/** The equipment set's location of the rings a character wears, two at most. */
const FINGERS = "Fingers";

/**
 * The lines PCGen writes of its own settings and of what the rules work out from the class and race (weapon
 * proficiencies, the pools' points, the equipment set the character's sheet is computed with): nothing to import.
 */
const LEFT_OUT = new Set([
  "AGESET",
  "ALLOWDEBT",
  "ARMORPROF",
  "AUTORESIZEGEAR",
  "AUTOSORTGEAR",
  "AUTOSORTSKILLS",
  "AUTOSPELLS",
  "CAMPAIGN",
  "CHARACTERTYPE",
  "EQSETBONUS",
  "EXPERIENCETABLE",
  "FAVOREDCLASS",
  "FEATPOOL",
  "GAMEMODE",
  "IGNORECOST",
  "LOADCOMPANIONS",
  "OUTPUTSHEETHTML",
  "OUTPUTSHEETPDF",
  "PCGVERSION",
  "PLAYERNAME",
  "POOLPOINTS",
  "POOLPOINTSAVAIL",
  "PORTRAIT",
  "PREVIEWSHEET",
  "PREVIEWVAR",
  "PURCHASEPOINTS",
  "REGION",
  "ROLLMETHOD",
  "SHIELDPROF",
  "SKILLFILTER",
  "SKILLSOUTPUTORDER",
  "SPELLBOOK",
  "SUPPRESSBIOFIELDS",
  "TABLABEL",
  "TABNAME",
  "TEMPBONUS",
  "USEHIGHERKNOWN",
  "USEHIGHERPREPPED",
  "USERPOOL",
  "USETEMPMODS",
  "VFEAT",
  "WEAPONPROF",
]);

/** The equipment set's location of what the character owns without carrying it. */
const NOT_CARRIED = "Not Carried";

/** The lines of the character's own text that go to its notes, each labelled. */
const NOTE_LABELS = new Map<string, string>([
  ["BIRTHDAY", "Birthday"],
  ["BIRTHPLACE", "Birthplace"],
  ["CATCHPHRASE", "Catchphrase"],
  ["CHARACTERASSET", "Assets"],
  ["CHARACTERCOMP", "Companions"],
  ["CHARACTERDMNOTES", "GM Notes"],
  ["CHARACTERMAGIC", "Magic"],
  ["CITY", "City"],
  ["EYECOLOR", "Eyes"],
  ["HAIRCOLOR", "Hair"],
  ["HAIRSTYLE", "Hair Style"],
  ["HANDED", "Handed"],
  ["INTERESTS", "Interests"],
  ["LOCATION", "Location"],
  ["PERSONALITYTRAIT1", "Personality"],
  ["PERSONALITYTRAIT2", "Personality"],
  ["PHOBIAS", "Phobias"],
  ["SKINCOLOR", "Skin"],
  ["SPEECHPATTERN", "Speech"],
]);

/** The equipment set's location of a pair of one weapon, one in each hand (two daggers). */
const TWO_WEAPONS = "Two Weapons";

/** The lines PCGen writes of what the import doesn't read yet, each with why: what the user adds in the app. */
const UNREAD_REASONS = new Map<string, string>([
  ["CHRONICLEENTRY", "Chronicle entries aren't imported: add them to the notes"],
  ["COMPANIONLIST", "Companions aren't imported"],
  ["DOMAINSPELLS", "Spells aren't imported yet"],
  ["FOLLOWER", "Companions aren't imported"],
  ["KIT", "Kits aren't imported"],
  ["MASTER", "Companions aren't imported"],
  ["SPELLLIST", "Spells aren't imported yet"],
  ["SPELLNAME", "Spells aren't imported yet"],
]);

/**
 * A PCGen character file of format 2.0 (PCGen 5.x and 6.x, `PCGVERSION:2.0`), read into the character it holds: each
 * line by its first tag, the lines of PCGen's own settings and of what the rules work out left out (`LEFT_OUT`), those
 * the import doesn't read yet listed with why (`UNREAD_REASONS`), and any other with a value listed as one nothing reads.
 */
export default class PcgFormat2 {
  constructor(private readonly lines: PcgLine[]) {}

  /** Whether an equipment set's location holds an item without wearing it: carried, or in a container. */
  private static isCarried(location: string, itemNames: Set<string>) {
    return CARRIED_LOCATIONS.has(location) || itemNames.has(location);
  }

  /**
   * Whether a customized item's modifiers (`DATA:EQMOD=…$…`, parted by `$`) enhance it: one of its parts holds an
   * `EQMOD=` and a `PLUS<n>` after it. Read part by part, in a time its length bounds, whatever the file holds.
   */
  private static isEnhanced(data: string) {
    return data.split("$").some((part) => {
      const at = part.indexOf("EQMOD=");
      return at >= 0 && /PLUS\d/.test(part.slice(at));
    });
  }

  /**
   * A worn entry as the places that wear it, one each: a pair of one weapon (PCGen's `Two Weapons`) a hand each, two
   * of one ring (`Fingers`, which PCGen counts as one entry) a finger each, one of any other at its place; the others
   * left to be carried.
   */
  private static unitsOf(entry: EquipSetEntry): EquipSetEntry[] {
    if (entry.location === TWO_WEAPONS) {
      return [
        { location: "Primary Hand", quantity: Math.min(1, entry.quantity) },
        ...(entry.quantity >= 2 ? [{ location: "Secondary Hand", quantity: 1 }] : []),
      ];
    }
    if (entry.quantity <= 1) return [entry];
    const worn = entry.location === FINGERS ? Math.min(2, Math.floor(entry.quantity)) : 1;
    return Array.from({ length: worn }, () => ({ location: entry.location, quantity: 1 }));
  }

  /** The character the file holds, as it reads it so far. */
  private readonly character: ImportedCharacter = {
    abilities: [],
    biography: { description: [], notes: [] },
    domains: [],
    feats: [],
    gear: [],
    identity: { xp: 0 },
    languages: [],
    levels: [],
    skills: [],
    source: { format: "2.0", program: "PCGen", version: "" },
    unread: [],
  };

  /** Each equipment set's entries by the item they hold, by the set's id. */
  private readonly equipSets = new Map<string, Map<string, EquipSetEntry[]>>();

  /** The items the file names (`EQUIPNAME`), in order, before their equipment set says where each is. */
  private readonly items: { item: Omit<ImportedGear, "location" | "quantity">; quantity: number }[] = [];

  /** What reads each line, by the tag it's named for. */
  private readonly readers = new Map<string, TagReader>([
    ["ABILITY", (line) => this.readAbility(line)],
    ["AGE", (line) => (this.character.identity.age = this.readNumber(line.value))],
    ["ALIGN", (line) => (this.character.identity.alignment = { line: line.line, value: line.value })],
    ["CALCEQUIPSET", (line) => (this.calcEquipSet = line.value)],
    ["CHARACTERBIO", (line) => this.addDescription(line.value)],
    ["CHARACTERDESC", (line) => this.addDescription(line.value)],
    ["CHARACTERNAME", (line) => (this.character.identity.name = line.value)],
    ["CLASS", (line) => this.readClass(line)],
    ["CLASSABILITIESLEVEL", (line) => this.readLevel(line)],
    ["DEITY", (line) => this.readDeity(line)],
    ["DOMAIN", (line) => this.character.domains.push({ line: line.line, name: line.value })],
    ["EQUIPNAME", (line) => this.readItem(line)],
    ["EQUIPSET", (line) => this.readEquipSet(line)],
    ["EXPERIENCE", (line) => (this.character.identity.xp = this.readNumber(line.value) ?? 0)],
    ["FEAT", (line) => this.readFeat(line, "FEAT")],
    ["GENDER", (line) => (this.character.identity.gender = { line: line.line, value: line.value })],
    ["HEIGHT", (line) => (this.character.identity.height = this.readNumber(line.value))],
    ["LANGUAGE", (line) => this.readLanguages(line)],
    ["MONEY", (line) => this.addNote("Money", line.value)],
    ["NOTE", (line) => this.addNote(line.value, line.find("VALUE") ?? "")],
    ["RACE", (line) => (this.character.identity.race = { line: line.line, value: line.value })],
    ["SKILL", (line) => this.readSkill(line)],
    ["STAT", (line) => this.readAbilityScore(line)],
    ["TEMPLATESAPPLIED", (line) => this.readTemplate(line)],
    ["VERSION", (line) => (this.character.source.version = line.value)],
    ["WEIGHT", (line) => (this.character.identity.weight = this.readNumber(line.value))],
  ]);

  /** The equipment set the character's sheet uses (`CALCEQUIPSET`), the first one when it names none. */
  private calcEquipSet?: string;

  /** Adds a paragraph of the character's description, when it says something. */
  private addDescription(value: string) {
    if (value.trim()) this.character.biography.description.push(value.trim());
  }

  /** Adds a labelled note, when it says something. */
  private addNote(label: string, value: string) {
    if (value.trim()) this.character.biography.notes.push(`${label}: ${value.trim()}`);
  }

  /**
   * Whether an equipment set's location sets what it holds apart from what's carried: `Not Carried`, or a container
   * that is (a chest left at home), its own container's place read in turn.
   */
  private isAway(location: string, entries: Map<string, EquipSetEntry[]>, seen = new Set<string>()): boolean {
    if (location === NOT_CARRIED) return true;
    const container = entries.get(location);
    if (!container || seen.has(location)) return false;
    seen.add(location);
    return container.every((entry) => this.isAway(entry.location, entries, seen));
  }

  /**
   * The gear the items make, by where the equipment set the character uses puts them: an entry worn or held (in a
   * location that isn't carried) a piece of its own, and what its entries leave of the item's quantity carried.
   */
  private placeGear(): ImportedGear[] {
    const setId = this.calcEquipSet ?? [...this.equipSets.keys()][0];
    const entries = (setId && this.equipSets.get(setId)) || new Map<string, EquipSetEntry[]>();
    const itemNames = new Set(this.items.map(({ item }) => item.name));
    const sum = (held: EquipSetEntry[]) => held.reduce((total, entry) => total + entry.quantity, 0);
    return this.items.flatMap(({ item, quantity }) => {
      const held = entries.get(item.name) ?? [];
      const wearing = held.filter((entry) => !PcgFormat2.isCarried(entry.location, itemNames));
      const worn = wearing.flatMap((entry) => PcgFormat2.unitsOf(entry));
      const left = quantity - sum(worn);
      // What the set holds but doesn't wear is carried (a pair's third dagger too); what it leaves out (or sets apart,
      // `Not Carried`, a chest left there with what it holds) is owned without being carried, but in a file of no set,
      // which says nothing of it
      const inSet = held.filter((entry) => !wearing.includes(entry) && !this.isAway(entry.location, entries));
      const extra = sum(wearing) - sum(worn);
      const carried = Math.max(0, entries.size > 0 ? Math.min(left, sum(inSet) + extra) : left);
      const away = left - carried;
      return [
        ...worn.map((entry) => ({ ...item, location: entry.location, quantity: entry.quantity })),
        ...(carried > 0 ? [{ ...item, quantity: carried }] : []),
        ...(away > 0 ? [{ ...item, notCarried: true as const, quantity: away }] : []),
      ];
    });
  }

  /**
   * An ability (`ABILITY:<pool>|TYPE:<nature>|CATEGORY:<category>|KEY:<name>`): a feat its user picked (`NORMAL`, of
   * category `FEAT`) read; one its rules give (`AUTOMATIC`, `VIRTUAL`) left out, as the class and race give it; any
   * other its user picked (a class feature's choice) listed as unread.
   */
  private readAbility(line: PcgLine) {
    const nature = line.find("TYPE");
    const category = line.find("CATEGORY") ?? "";
    if (nature !== "NORMAL" || category.startsWith("*") || category === "Internal") return;
    if (category === "FEAT") {
      this.readFeat(line, line.value);
      return;
    }
    this.character.unread.push({
      line: line.line,
      reason: "Class feature choices aren't imported: pick it in the app",
    });
  }

  /** An ability score (`STAT:STR|SCORE:16`): the score before its race's adjustments, its level increases in. */
  private readAbilityScore(line: PcgLine) {
    const score = this.readNumber(line.find("SCORE") ?? "");
    if (score !== undefined) this.character.abilities.push({ key: line.value, line: line.line, score });
  }

  /**
   * A class's line (`CLASS:<class>|SUBCLASS:<school>|PROHIBITED:<schools>|…`): its levels are its level lines', and a
   * choice it records (a specialist wizard's school, the schools it gives up) is listed, as class feature choices
   * aren't imported.
   */
  private readClass(line: PcgLine) {
    const chosen = ["SUBCLASS", "PROHIBITED"].some((tag) => {
      const value = line.find(tag)?.trim();
      return value !== undefined && value !== "" && value !== "None";
    });
    if (!chosen) return;
    this.character.unread.push({
      line: line.line,
      reason: "Class feature choices aren't imported: pick it in the app",
    });
  }

  /** The deity the character worships (`DEITY:<name>|…`), none for PCGen's `None`. */
  private readDeity(line: PcgLine) {
    if (line.value && line.value !== "None") this.character.identity.deity = line.value;
  }

  /**
   * An equipment set's entry (`EQUIPSET:<location>|ID:<set>.<entry>|VALUE:<item>|QUANTITY:<n>`), by its set: the set's
   * own line (`EQUIPSET:Default Set|ID:0.1`) names no item.
   */
  private readEquipSet(line: PcgLine) {
    const id = line.find("ID") ?? "";
    const item = line.find("VALUE");
    const setId = id.split(".").slice(0, 2).join(".");
    if (!this.equipSets.has(setId)) this.equipSets.set(setId, new Map());
    if (!item) return;
    const entries = this.equipSets.get(setId)!;
    const quantity = this.readNumber(line.find("QUANTITY") ?? "") ?? 1;
    entries.set(item, [...(entries.get(item) ?? []), { location: line.value, quantity }]);
  }

  /** A feat its user picked, in its pool (`pool`), with the choice it's taken with (`APPLIEDTO`), when it has one. */
  private readFeat(line: PcgLine, pool: string) {
    const name = line.find("KEY") ?? line.value;
    const choice = line.find("APPLIEDTO") || undefined;
    const feat: ImportedFeat = { line: line.line, name, pool, ...(choice && { choice }) };
    this.character.feats.push(feat);
  }

  /**
   * An item (`EQUIPNAME:<name>|QUANTITY:<n>|CUSTOMIZATION:[BASEITEM:<base>|DATA:…]`): its base item a customized one's,
   * magic when its modifiers enhance it (`EQMOD=…PLUS1W…`) or its name says it is (`+1`).
   */
  private readItem(line: PcgLine) {
    const customization = PcgLine.nested(line.find("CUSTOMIZATION") ?? "");
    const baseName = customization.find((part) => part.tag === "BASEITEM")?.value;
    const data = customization.find((part) => part.tag === "DATA")?.value ?? "";
    const magic = PcgFormat2.isEnhanced(data) || /\+\d/.test(line.value);
    const quantity = this.readNumber(line.find("QUANTITY") ?? "") ?? 1;
    // The charges left, which PCGen keeps in the modifier that gives them (`CHARGES[23]`)
    const charges = /CHARGES\[(\d+)\]/.exec(data)?.[1];
    const item = {
      line: line.line,
      magic,
      name: line.value,
      ...(baseName && baseName !== line.value && { baseName }),
      ...(charges !== undefined && { charges: Number(charges) }),
    };
    this.items.push({ item, quantity });
  }

  /** The languages the character speaks (`LANGUAGE:Common|LANGUAGE:Dwarven`). */
  private readLanguages(line: PcgLine) {
    for (const name of line.findAll("LANGUAGE")) if (name) this.character.languages.push({ line: line.line, name });
  }

  /**
   * A level (`CLASSABILITIESLEVEL:<class>=<level>|HITPOINTS:<hp>|PRESTAT:<STAT>=<change>…`), in the order the character
   * took it, with the changes to its ability scores PCGen recorded at it.
   */
  private readLevel(line: PcgLine) {
    const [className, classLevel] = line.value.split("=");
    const abilityChanges = line.findAll("PRESTAT").flatMap((change) => {
      const [key, amount] = change.split("=");
      const value = this.readNumber(amount ?? "");
      return value ? [{ amount: value, key }] : [];
    });
    const level: ImportedLevel = {
      abilityChanges,
      className,
      classLevel: this.readNumber(classLevel ?? "") ?? 0,
      hp: this.readNumber(line.find("HITPOINTS") ?? "") ?? 0,
      line: line.line,
    };
    this.character.levels.push(level);
  }

  /** A number of a value, if it is one (PCGen writes whole ones as decimals too: `QUANTITY:2.0`). */
  private readNumber(value: string): number | undefined {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : undefined;
  }

  /** A skill's ranks (`SKILL:<name>|CLASSBOUGHT:[CLASS:<class>|RANKS:<n>|…]…`), none for one without. */
  private readSkill(line: PcgLine) {
    const bought = line.findAll("CLASSBOUGHT").flatMap((value) => {
      const tags = new Map(PcgLine.nested(value).map((part) => [part.tag, part.value]));
      const ranks = this.readNumber(tags.get("RANKS") ?? "") ?? 0;
      if (ranks <= 0) return [];
      return [{ className: tags.get("CLASS") ?? "", ranks }];
    });
    const skill: ImportedSkill = { bought, line: line.line, name: line.value };
    if (bought.length > 0) this.character.skills.push(skill);
  }

  /**
   * A template applied to the character (`TEMPLATESAPPLIED:[NAME:<name>]`): one PCGen applies by itself left out, its
   * race's or a class's (`Human Base`, `Base Race Type`, its subrace's `Hill Dwarf`, `Cleric ~ Bonus Languages`) or
   * its own (a key run together, `RighteousMightDR`); any other listed (`Half-Celestial`), as templates aren't
   * imported.
   */
  private readTemplate(line: PcgLine) {
    const name = PcgLine.nested(line.value).find((part) => part.tag === "NAME")?.value ?? line.value;
    const race = this.character.identity.race?.value;
    const automatic =
      name === "Base Race Type" ||
      name.endsWith(" Base") ||
      name.includes(" ~ ") ||
      (!/\s/.test(name) && /[a-z][A-Z]/.test(name)) ||
      (race !== undefined && name.endsWith(` ${race}`));
    if (!automatic) this.character.unread.push({ line: line.line, reason: "Templates aren't imported" });
  }

  /** Lists a line nothing reads. */
  private unread(line: SourceLine) {
    this.character.unread.push({ line, reason: "Not read by the import" });
  }

  /**
   * The character the file holds: each line read by the tag it's named for, a note of its own text (`NOTE_LABELS`)
   * kept in its notes, and a line left out, unread with why, or nothing reads; then its gear, by where its equipment
   * set puts each item.
   */
  read(): ImportedCharacter {
    for (const line of this.lines) {
      const reader = this.readers.get(line.tag);
      if (reader) reader(line);
      else if (NOTE_LABELS.has(line.tag)) this.addNote(NOTE_LABELS.get(line.tag)!, line.value);
      else if (UNREAD_REASONS.has(line.tag))
        this.character.unread.push({ line: line.line, reason: UNREAD_REASONS.get(line.tag)! });
      else if (!LEFT_OUT.has(line.tag) && line.value.trim()) this.unread(line.line);
    }
    this.character.gear = this.placeGear();
    return this.character;
  }
}
