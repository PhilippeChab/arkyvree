/** Each ruleset entity's form, empty: what its create dialog opens on, and what its edit form holds until it loads. */

import type { AptitudeFormData } from "./AptitudeFormFields.tsx";
import type { FeatFormData } from "./FeatFormFields.tsx";
import type { LanguageFormData } from "./LanguageFormFields.tsx";
import type { MechanicFormData } from "./MechanicFormFields.tsx";
import type { RaceFormData } from "./RaceFormFields.tsx";
import type { SaveFormData } from "./SaveFormFields.tsx";

export const EMPTY_APTITUDE: AptitudeFormData = { name: "", description: "" };

export const EMPTY_FEAT: FeatFormData = { name: "", description: "", aptitudeIds: [] };

export const EMPTY_LANGUAGE: LanguageFormData = { name: "", description: "", type: "" };

export const EMPTY_MECHANIC: MechanicFormData = { name: "", description: "" };

export const EMPTY_RACE: RaceFormData = { name: "", description: "", size: "Medium", baseSpeed: 30 };

export const EMPTY_SAVE: SaveFormData = { name: "", description: "", abilityId: "" };
