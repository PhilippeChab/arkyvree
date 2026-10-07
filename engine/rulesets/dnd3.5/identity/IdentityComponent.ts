import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/classes/ClassesComponent.ts";
import { type Character, type Language, type Race } from "@/shared/relations.ts";

type IdentityData = {
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
    race: Race;
    weight: string;
  };
};

export default class IdentityComponent {
  constructor(
    protected readonly abilities: AbilitiesComponent,
    protected readonly classes: ClassesComponent,
  ) {}

  protected readonly identity: IdentityData = {} as IdentityData;

  /**
   * The GM's notes on the character, held apart from the identity the target paths walk: no modifier or requirement
   * reads them, so none can copy them into a field others see, or tell them by whether it's met.
   */
  private privateNotes = "";

  getIdentity() {
    return this.identity;
  }

  /** The GM's notes on the character (`privateNotes`), which the sheet's response shows its owner. */
  getPrivateNotes(): string {
    return this.privateNotes;
  }

  initialize(character: Character, race: Race, languages: Language[]) {
    const classes = this.classes.getClasses();
    const level = Object.values(classes).reduce((acc, klass) => acc + klass.level, 0);

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
      level,
      xp: character.xp,
    };
  }
}
