import { CharacterComponent } from "@/engine/core/character/index.ts";
import CharacterValues from "@/engine/rulesets/dnd3.5/characters/CharacterValues.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type LanguagesComponent from "@/engine/rulesets/dnd3.5/model/languages/LanguagesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { CustomizedRace } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type { Language } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

interface IdentityData {
  background: {
    notes: string;
  };
  beliefs: {
    alignment: string;
    deity: string;
  };
  meta: {
    level: number;
    xp: number;
  };
  physiology: {
    age?: number;
    description: string;
    gender: string;
    height: string;
    /** Every language it speaks, granted then picked: its languages' component's, counted when read */
    readonly languages: Language[];
    name: string;
    /** The race as the character reads it, its fields with it: what its size, its legs and its speed follow */
    race: CustomizedRace;
    weight: string;
  };
}

/**
 * Who a character is: its row's description, its race, the languages it speaks (its languages' component's), and its
 * level, counted from its classes.
 */
export default class IdentityComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(
    private readonly classes: ClassesComponent,
    private readonly languages: LanguagesComponent,
  ) {
    super();
  }

  private readonly identity: IdentityData = {} as IdentityData;

  /**
   * The GM's notes on the character, held apart from the identity the target paths walk: no modifier or requirement
   * reads them, so none can copy them into a field others see, or tell them by whether it's met.
   */
  private privateNotes = "";

  /**
   * Who the character is, from its row and its race. The languages it speaks are its languages' component's, counted
   * when read, once modifiers apply; its level (`meta.level`) is the levels its classes hold, counted when read (one a
   * picker projects counts), and what a modifier adds to it.
   */
  override initialize({ character, race }: Pick<LoadedCharacterData, "character" | "race">) {
    const levelOfClasses = () =>
      Object.values(this.classes.getClasses()).reduce((acc, klass) => acc + klass.levels.length, 0);
    const spoken = () => this.languages.getSpoken();
    let levelBonus = 0;

    const fields = CharacterValues.fieldsOf(character);
    this.identity.physiology = {
      name: character.name,
      description: character.description || "",
      age: fields[CHARACTER_AGE],
      gender: fields[CHARACTER_GENDER],
      height: fields[CHARACTER_HEIGHT] ?? "",
      weight: fields[CHARACTER_WEIGHT] ?? "",
      race,
      get languages() {
        return spoken();
      },
    };
    this.identity.beliefs = {
      deity: fields[CHARACTER_DEITY] || "",
      alignment: fields[CHARACTER_ALIGNMENT],
    };
    this.identity.background = {
      notes: character.notes || "",
    };
    this.privateNotes = character.privateNotes || "";

    this.identity.meta = {
      get level() {
        return levelOfClasses() + levelBonus;
      },
      set level(value: number) {
        levelBonus = value - levelOfClasses();
      },
      xp: fields[CHARACTER_XP],
    };
  }

  getIdentity(): IdentityData {
    return this.identity;
  }

  /** The GM's notes on the character (`privateNotes`), which the sheet's response shows its owner. */
  getPrivateNotes(): string {
    return this.privateNotes;
  }
}
