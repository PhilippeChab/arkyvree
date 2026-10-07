import type AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/server/rulesets/dnd3.5/classes/ClassesComponent.ts";
import { type Character, type Language, type Race } from "@/shared/relations.ts";

type IdentityData = {
  physiology: {
    name: string;
    description: string;
    age?: number;
    gender: string;
    height?: string;
    weight?: string;
    race: Race;
    languages: Language[];
  };
  beliefs: {
    deity: string;
    alignment: string;
  };
  background: {
    notes: string;
    privateNotes: string;
  };
  meta: {
    level: number;
    xp: number;
  };
};

export default class IdentityComponent {
  constructor(
    protected readonly abilities: AbilitiesComponent,
    protected readonly classes: ClassesComponent,
  ) {}

  protected readonly identity: IdentityData = {} as IdentityData;

  getIdentity() {
    return this.identity;
  }

  initialize(character: Character, race: Race, languages: Language[]) {
    const classes = this.classes.getClasses();
    const level = Object.values(classes).reduce((acc, klass) => acc + klass.level, 0);

    this.identity.physiology = {
      name: character.name,
      description: character.description || "",
      age: character.age ?? undefined,
      gender: character.gender,
      height: character.height ?? undefined,
      weight: character.weight ?? undefined,
      race,
      languages,
    };
    this.identity.beliefs = {
      deity: character.deity || "",
      alignment: character.alignment,
    };
    this.identity.background = {
      notes: character.notes || "",
      privateNotes: character.privateNotes || "",
    };

    this.identity.meta = {
      level,
      xp: character.xp,
    };
  }
}
