import {
  AccessibilityIcon,
  BoltIcon,
  ConstructionIcon,
  EntityIcon,
  FaceIcon,
  FitnessIcon,
  GavelIcon,
  PsychologyIcon,
  ShieldIcon,
  SpokeIcon,
  StarsIcon,
  type SvgIconComponent,
  TranslateIcon,
} from "./index.ts";

/**
 * The picture an entity kind's tab shows, by the generic name its rules give it (`icon`: `face`, `bolt`), else a
 * generic one. Each is the index's, read as it's asked for: the index exports this too.
 */
export function kindIcon(icon: string): SvgIconComponent {
  switch (icon) {
    case "accessibility":
      return AccessibilityIcon;
    case "bolt":
      return BoltIcon;
    case "construction":
      return ConstructionIcon;
    case "face":
      return FaceIcon;
    case "fitness":
      return FitnessIcon;
    case "gavel":
      return GavelIcon;
    case "psychology":
      return PsychologyIcon;
    case "shield":
      return ShieldIcon;
    case "spoke":
      return SpokeIcon;
    case "stars":
      return StarsIcon;
    case "translate":
      return TranslateIcon;
    default:
      return EntityIcon;
  }
}
