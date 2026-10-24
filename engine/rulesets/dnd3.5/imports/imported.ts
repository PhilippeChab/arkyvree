/**
 * A character as another program's file holds it, read line by line before the ruleset's entities match it: what a
 * program's reader answers (`PcgenFile`'s), in the program's own names, each part with the line of the file it was read
 * from, so the import's report names what it couldn't match.
 */

import type { SourceLine } from "@/engine/core/imports/index.ts";

/** An ability score as the file holds it: the program's key for the ability (`STR`) and its score. */
export interface ImportedAbility extends SourcedPart {
  key: string;
  score: number;
}

/**
 * A character as another program's file holds it: who it is, its scores, its levels in the order taken, its feats and
 * skills (not placed on a level: the file doesn't say where), its languages and gear, and the lines nothing reads.
 */
export interface ImportedCharacter {
  abilities: ImportedAbility[];
  /** The character's own text: its biography and its other notes, labelled */
  biography: ImportedText;
  domains: ImportedName[];
  feats: ImportedFeat[];
  gear: ImportedGear[];
  identity: ImportedIdentity;
  languages: ImportedName[];
  levels: ImportedLevel[];
  skills: ImportedSkill[];
  /** The program and its version that saved the file, and the file's format */
  source: { format: string; program: string; version: string };
  /** The spells the character chose to know (a sorcerer's, a wizard's spellbook), each of its class */
  spells: ImportedSpell[];
  /** The lines the reader knows it can't import, each with why (a template, a companion) */
  unread: { line: SourceLine; reason: string }[];
}

/** A feat as the file holds it: its name, the choice it's taken with (`Weapon Focus` of `Sword (Bastard)`) and its pool. */
export interface ImportedFeat extends SourcedPart {
  choice?: string;
  name: string;
  /** The program's pool it was picked in (PCGen's `FEAT`, `Fighter Feat`) */
  pool: string;
}

/**
 * A piece of gear: its name, the base item it's made of (a custom one's), whether it's magic (enhanced past its base),
 * how many, the charges it has left (a wand's, when the file records them), and where it's worn (the program's
 * location: `Primary Hand`, `Armor`), none when it's carried; `notCarried` when the character owns it without carrying
 * it (left at home).
 */
export interface ImportedGear extends SourcedPart {
  baseName?: string;
  charges?: number;
  location?: string;
  magic: boolean;
  name: string;
  notCarried?: true;
  quantity: number;
}

/** Who the character is: its name, race, alignment and the rest of its identity, in the program's words. */
export interface ImportedIdentity {
  age?: number;
  alignment?: SourcedValue;
  deity?: string;
  gender?: SourcedValue;
  /** In inches */
  height?: number;
  name?: string;
  race?: SourcedValue;
  /** In pounds */
  weight?: number;
  xp: number;
}

/**
 * A level, in the order the character took it: its class and the class's level, the hit points it rolled, and the
 * changes to its ability scores the program recorded at it.
 */
export interface ImportedLevel extends SourcedPart {
  abilityChanges: { amount: number; key: string }[];
  classLevel: number;
  className: string;
  hp: number;
}

/** A name the file holds (a language, a domain), with its line. */
export interface ImportedName extends SourcedPart {
  name: string;
}

/** A skill's ranks as the file holds them: bought in each class (`className`). */
export interface ImportedSkill extends SourcedPart {
  bought: { className: string; ranks: number }[];
  name: string;
}

/**
 * A spell the character chose to know, as the file holds it: its name, the class it's known as (`className`), and its
 * level in that class's list.
 */
export interface ImportedSpell extends SourcedPart {
  className: string;
  level: number;
  name: string;
}

/**
 * The character's own text: its description, its notes (each labelled), and the notes for its game master alone
 * (`privateNotes`: PCGen's DM notes), which a reader of its sheet doesn't see.
 */
export interface ImportedText {
  description: string[];
  notes: string[];
  privateNotes: string[];
}

/** What the file holds of a part of the character, with the line it was read from. */
export interface SourcedPart {
  line: SourceLine;
}

/** A value the file holds, with the line it was read from. */
export interface SourcedValue extends SourcedPart {
  value: string;
}
