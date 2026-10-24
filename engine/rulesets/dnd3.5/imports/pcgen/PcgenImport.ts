import { ImportReport } from "@/engine/core/imports/index.ts";
import type { CharacterInput, ImportedRow, ImportOwner, ImportPlan, ScorePlan } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35Characters from "@/engine/rulesets/dnd3.5/characters/Dnd35Characters.ts";
import type { ImportedCharacter } from "@/engine/rulesets/dnd3.5/imports/imported.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { MAX_CHARACTER_NAME_LENGTH, MAX_CHARACTER_NUMBER } from "@/shared/characters.ts";
import { type Gender, GENDER_OPTIONS } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";

import GearImport from "./GearImport.ts";
import LevelsImport, { type LevelStop } from "./LevelsImport.ts";
import { PCGEN_ALIGNMENTS } from "./names.ts";
import PcgenNames from "./PcgenNames.ts";
import ScoresImport from "./ScoresImport.ts";

/** The row a 3.5 import fills: every column of it, its details too. */
type FilledRow = ImportedRow & Pick<Character, "age" | "deity" | "description" | "height" | "weight">;

/** The inches in a foot, which a height PCGen writes in inches is said in. */
const INCHES_PER_FOOT = 12;

/**
 * A character a PCGen file holds (`imported`), imported into a ruleset's view: who it is, its race and scores, its
 * levels as if leveled up one at a time, its languages and its gear, each matched by name in the ruleset (through
 * `PcgenNames`), and the report of what it imported and every line of the file it couldn't match.
 */
export default class PcgenImport {
  constructor(
    private readonly view: RulesetView,
    private readonly imported: ImportedCharacter,
    private readonly owner: ImportOwner,
    private readonly stop?: LevelStop,
  ) {
    const { program, version } = imported.source;
    this.report = new ImportReport(`${program} ${version}`.trim());
    this.names = new PcgenNames(view.rulesetData);
  }

  /** A height PCGen writes in inches, in feet and inches (`6' 2"`). */
  private static feetOf(inches: number) {
    const whole = Math.round(inches);
    return `${Math.floor(whole / INCHES_PER_FOOT)}' ${whole % INCHES_PER_FOOT}"`;
  }

  /** A gender as the app keeps it: the file's, its case aside, or its initial's (`M`); none when it's neither. */
  private static genderOf(value: string): Gender | undefined {
    const wanted = value.trim().toLowerCase();
    return GENDER_OPTIONS.find((gender) => gender.toLowerCase() === wanted || gender[0].toLowerCase() === wanted);
  }

  private readonly characters = new Dnd35Characters(DND35_STORAGE);

  private readonly names: PcgenNames;

  private readonly report: ImportReport;

  /** A whole number of the file's within what the app keeps (`max`), which the report says when it's past it. */
  private bounded(what: string, value: number, max: number) {
    const rounded = Math.round(value);
    if (rounded <= max) return rounded;
    this.report.issue(`${what} ${rounded} is past the largest the app keeps: ${max} kept`);
    return max;
  }

  /**
   * The character's race: the file's, or the race a subrace the ruleset hasn't is a kind of ("Elf (Drow)": "Elf"),
   * which the report says. Refused when the ruleset has neither: a character needs one.
   */
  private findRace() {
    const named = this.imported.identity.race?.value;
    const race = named && this.names.findRace(named);
    if (race) return race;
    const base = named && this.names.findBaseRace(named);
    if (!base) throw new RulesError("unprocessable", `The file's race (${named ?? "none"}) isn't in this ruleset`);
    this.report.issue(`Race ${named} isn't one of the ruleset's: ${base.name}, the race it's a kind of, imported`);
    return base;
  }

  /**
   * The character's rows before its levels: its row, under the id it's created with and its owner's, its ability scores,
   * and nothing else yet. What its levels, languages and gear are planned against, and its bonded creatures take after.
   */
  private newInput(row: FilledRow, abilities: ScorePlan[]): CharacterInput {
    const now = new Date().toISOString();
    const stamps = { createdAt: now, deletedAt: null, updatedAt: now };
    const { characterId: id, userId } = this.owner;
    const record = {
      ...row,
      ...stamps,
      id,
      kind: "pc",
      lastChangedAt: now,
      parentCharacterId: null,
      rulesetId: this.view.ruleset.id,
      shareToken: null,
      userId,
    };
    const rows = {
      campaign: undefined,
      inventory: [],
      levels: [],
      links: {
        abilities: abilities.map(({ amount, entityId }) => ({
          abilityId: entityId,
          score: amount,
          ...stamps,
          characterId: id,
        })),
        languages: [],
      },
      modifiers: [],
      picks: { abilityIncreases: [], feats: [], powers: [], skills: [] },
      player: undefined,
      requirements: [],
    };
    return { record, rows };
  }

  /**
   * The languages the character (`character`, with its levels) picks of those the file names, one at a time: those
   * its rules give it without a pick aside, a pick past the room they leave listed, and one the ruleset hasn't too.
   */
  private planLanguages(character: CharacterInput): string[] {
    const kept: string[] = [];
    // The last plan that took a language: what the character speaks with those kept
    let planned = this.characters.planLinkPicks(this.view, character, "languages", kept);
    for (const language of this.imported.languages) {
      const found = this.names.findLanguage(language.name);
      if (!found) {
        this.report.skip(language.line, `${language.name} isn't a language of the ruleset`);
        continue;
      }
      if (kept.includes(found.id)) {
        this.report.skip(language.line, `${language.name} is imported already, from another name of it`);
        continue;
      }
      try {
        planned = this.characters.planLinkPicks(this.view, character, "languages", [...kept, found.id]);
        kept.push(found.id);
      } catch (error) {
        if (!(error instanceof RulesError)) throw error;
        this.report.skip(language.line, `${language.name}: ${error.message}`);
      }
    }
    const { entityIds } = planned;
    const { languagesById } = Dnd35View.of(this.view.rulesetData);
    const spoken = kept.map((id) => languagesById.get(id)?.name).join(", ");
    if (spoken) this.report.import(`Languages: ${spoken}`);
    return entityIds;
  }

  /**
   * The character's row, as the file has it: its race (refused when the ruleset hasn't it: a character needs one), its
   * alignment (True Neutral when the file's isn't one, which the report says), and the rest of who it is.
   */
  private readRow(): FilledRow {
    const { identity, biography } = this.imported;
    const race = this.findRace();
    const alignment = identity.alignment && PCGEN_ALIGNMENTS.get(identity.alignment.value);
    if (identity.alignment && !alignment)
      this.report.skip(identity.alignment.line, `${identity.alignment.value} isn't an alignment: True Neutral kept`);
    const named = identity.name?.trim() || "Imported Character";
    const name = named.slice(0, MAX_CHARACTER_NAME_LENGTH);
    if (name !== named) this.report.issue(`The name is past ${MAX_CHARACTER_NAME_LENGTH} characters: cut to them`);
    const gender = identity.gender && PcgenImport.genderOf(identity.gender.value);
    if (identity.gender?.value && !gender)
      this.report.skip(identity.gender.line, `${identity.gender.value} isn't a gender of the app's: Other kept`);
    this.report.import(`Name: ${name}`);
    this.report.import(`Race: ${race.name}`);
    return {
      age: identity.age && identity.age >= 1 ? this.bounded("Age", identity.age, MAX_CHARACTER_NUMBER) : null,
      alignment: alignment ?? "True Neutral",
      deity: identity.deity ?? null,
      description: biography.description.join("\n\n") || null,
      gender: gender ?? "Other",
      height: identity.height ? PcgenImport.feetOf(identity.height) : null,
      name,
      notes: biography.notes.join("\n") || null,
      privateNotes: biography.privateNotes.join("\n\n") || null,
      raceId: race.id,
      weight: identity.weight ? `${identity.weight} lb.` : null,
      xp: Math.max(0, this.bounded("Experience", identity.xp, MAX_CHARACTER_NUMBER)),
    };
  }

  /**
   * What importing the character writes: its row and scores, its levels (as if leveled up one at a time, stopping at
   * `stop` when given), its languages, its gear and what its bonded creatures become; and the report, every line it
   * couldn't match listed. Or where its levels stop (`refused`): a level a level-up refuses even forced, which its
   * importer plans it again without, its increases out of the starting scores.
   */
  plan(): { plan: ImportPlan } | { refused: LevelStop } {
    for (const { line, reason } of this.imported.unread) this.report.skip(line, reason);
    const row = this.readRow();
    const levelsImport = new LevelsImport(this.view, this.imported, this.names, this.report, this.stop);
    const scores = new ScoresImport(this.view, this.imported, this.report).planScores(levelsImport.levelCount);
    const start = { picks: { raceId: row.raceId }, scores: { abilities: scores.starting } };
    const { abilities } = this.characters.planStart(this.view, start).links;
    const leveled = levelsImport.planLevels(this.newInput(row, abilities), scores.increases);
    if ("refused" in leveled) return leveled;
    const languageIds = this.planLanguages(leveled.character);
    const inventory = new GearImport(this.view, this.names, this.report).planInventory(
      leveled.character,
      this.imported.gear,
    );
    const plan = {
      character: row,
      children: leveled.children,
      inventory,
      levels: leveled.levels,
      links: { abilities, languages: languageIds.map((entityId) => ({ entityId })) },
      report: this.report.describe(),
    };
    return { plan };
  }
}
