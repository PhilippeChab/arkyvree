import {
  AbilitiesIcon,
  AptitudesIcon,
  ClassesIcon,
  EntityIcon,
  FeatsIcon,
  ItemsIcon,
  LanguagesIcon,
  MechanicsIcon,
  PowersIcon,
  RacesIcon,
  SavesIcon,
  SkillsIcon,
  type SvgIconComponent,
} from "./index.ts";

/**
 * The picture an entity kind's tab shows, by the generic name its rules give it (`icon`: `face`, `bolt`), else a
 * generic one. Each is the index's, read as it's asked for: the index exports this too.
 */
export function kindIcon(icon: string): SvgIconComponent {
  switch (icon) {
    case "accessibility":
      return ClassesIcon;
    case "bolt":
      return PowersIcon;
    case "construction":
      return ItemsIcon;
    case "face":
      return RacesIcon;
    case "fitness":
      return AbilitiesIcon;
    case "gavel":
      return MechanicsIcon;
    case "psychology":
      return SkillsIcon;
    case "shield":
      return SavesIcon;
    case "spoke":
      return FeatsIcon;
    case "stars":
      return AptitudesIcon;
    case "translate":
      return LanguagesIcon;
    default:
      return EntityIcon;
  }
}
