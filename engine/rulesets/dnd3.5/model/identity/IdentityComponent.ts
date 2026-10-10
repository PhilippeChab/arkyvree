import { CharacterComponent } from "@/engine/core/character/index.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { CustomizedRace } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import { type Language } from "@/shared/relations.ts";

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
    languages: Language[];
    name: string;
    /** The race as the character reads it, its fields with it: what its size, its legs and its speed follow */
    race: CustomizedRace;
    weight: string;
  };
}

/** Who a character is: its row's description, its race and languages, and its level, counted from its classes. */
export default class IdentityComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly classes: ClassesComponent) {
    super();
  }

  private readonly identity: IdentityData = {} as IdentityData;

  /**
   * The GM's notes on the character, held apart from the identity the target paths walk: no modifier or requirement
   * reads them, so none can copy them into a field others see, or tell them by whether it's met.
   */
  private privateNotes = "";

  /**
   * Who the character is, from its row, its race and its languages. Its level (`meta.level`) is the levels its classes
   * hold, counted when read (one a picker projects counts), and what a modifier adds to it.
   */
  override initialize({ character, languages, race }: Pick<LoadedCharacterData, "character" | "languages" | "race">) {
    const levelOfClasses = () =>
      Object.values(this.classes.getClasses()).reduce((acc, klass) => acc + klass.levels.length, 0);
    let levelBonus = 0;

    this.identity.physiology = {
      name: character.name,
      description: character.description || "",
      age: character.age ?? undefined,
      gender: character.gender,
      height: character.height ?? "",
      weight: character.weight ?? "",
      race,
      languages,
    };
    this.identity.beliefs = {
      deity: character.deity || "",
      alignment: character.alignment,
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
      xp: character.xp,
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
