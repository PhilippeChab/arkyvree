import type { TargetPath } from "@/shared/customization/target.ts";
import { type Character, type Language, type Race } from "@/shared/relations.ts";
import { deriveSegmentLabels } from "@/shared/utils.ts";
import type DetailedCharacterAbilities from "./DetailedCharacterAbilities.ts";
import type DetailedCharacterClasses from "./DetailedCharacterClasses.ts";

const NAVIGATABLE_IDENTITY_PATHS = [
  { path: "name", description: "Character name", type: "string" as const },
  { path: "description", description: "Physical description", type: "string" as const },
  { path: "age", description: "Character age", type: "number" as const },
  { path: "gender", description: "Character gender", type: "string" as const },
  { path: "height", description: "Character height", type: "string" as const },
  { path: "weight", description: "Body weight", type: "string" as const },
  { path: "race.name", description: "Race name", type: "string" as const },
  { path: "race.size", description: "Size (e.g., Medium, Small)", type: "string" as const },
];

const NAVIGATABLE_BELIEFS_PATHS = [
  { path: "deity", description: "Character deity", type: "string" as const },
  { path: "alignment", description: "e.g., Lawful Good", type: "string" as const },
];

const NAVIGATABLE_BACKGROUND_PATHS = [
  { path: "notes", description: "Public notes", type: "string" as const },
  { path: "privateNotes", description: "Private notes (GM only)", type: "string" as const },
];

const NAVIGATABLE_META_PATHS = [
  { path: "level", description: "Total character level (all classes combined)", type: "number" as const },
  { path: "xp", description: "Current experience points", type: "number" as const },
];

const SEGMENT_LABELS: Record<string, string> = {
  xp: "Experience Points",
};

export type DetailedCharacterComprehensiveIdentity = {
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

export default class DetailedCharacterIdentity {
  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(
      [...NAVIGATABLE_IDENTITY_PATHS, ...NAVIGATABLE_BELIEFS_PATHS, ...NAVIGATABLE_BACKGROUND_PATHS, ...NAVIGATABLE_META_PATHS],
      { physiology: "Physiology", beliefs: "Beliefs", background: "Background", meta: "Meta", ...SEGMENT_LABELS },
    );
  }

  static generateTargetPaths(
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const subPath of NAVIGATABLE_IDENTITY_PATHS) {
      paths.push({
        path: `identity.physiology.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: kind === "modifier"
          ? (subPath.type === "string" ? ["set"] : ["add", "subtract", "multiply", "divide", "set"])
          : (subPath.type === "string" ? ["equal", "not_equal"] : [
            "equal",
            "not_equal",
            "greater_than",
            "less_than",
            "greater_than_or_equal",
            "less_than_or_equal",
          ]),
      });
    }

    for (const subPath of NAVIGATABLE_BELIEFS_PATHS) {
      paths.push({
        path: `identity.beliefs.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
      });
    }

    for (const subPath of NAVIGATABLE_BACKGROUND_PATHS) {
      paths.push(
        {
          path: `identity.background.${subPath.path}`,
          category: "identity",
          description: subPath.description,
          valueType: subPath.type,
          operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
        },
      );
    }

    for (const subPath of NAVIGATABLE_META_PATHS) {
      paths.push({
        path: `identity.meta.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: kind === "modifier" ? ["add", "subtract", "multiply", "divide", "set"] : [
          "equal",
          "not_equal",
          "greater_than",
          "less_than",
          "greater_than_or_equal",
          "less_than_or_equal",
        ],
      });
    }

    return paths;
  }

  protected readonly detailedCharacterIdentity: DetailedCharacterComprehensiveIdentity =
    {} as DetailedCharacterComprehensiveIdentity;

  constructor(
    protected readonly characterAbilities: DetailedCharacterAbilities,
    protected readonly characterClasses: DetailedCharacterClasses,
  ) {}

  initialize(
    character: Character,
    race: Race,
    languages: Language[],
  ) {
    const classes = this.characterClasses.getClasses();
    const level = Object.values(classes).reduce((acc, klass) => acc + klass.level, 0);

    this.detailedCharacterIdentity.physiology = {
      name: character.name,
      description: character.description || "",
      age: character.age ?? undefined,
      gender: character.gender,
      height: character.height ?? undefined,
      weight: character.weight ?? undefined,
      race,
      languages,
    };
    this.detailedCharacterIdentity.beliefs = {
      deity: character.deity || "",
      alignment: character.alignment,
    };
    this.detailedCharacterIdentity.background = {
      notes: character.notes || "",
      privateNotes: character.privateNotes || "",
    };

    this.detailedCharacterIdentity.meta = {
      level,
      xp: character.xp,
    };
  }

  getIdentity() {
    return this.detailedCharacterIdentity;
  }

  getSection(sectionName: "physiology" | "beliefs" | "background" | "meta") {
    return this.detailedCharacterIdentity[sectionName];
  }
}
