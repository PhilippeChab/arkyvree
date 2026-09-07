import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MASTER_OF_MANY_FORMS: ClassSeed = {
  name: "Master of Many Forms",
  description: "A master of many forms has no shape that she calls her own. Instead, she occupies whatever body is most expedient for her at the time. While others base their identities largely on their external forms, a master of many forms actually comes closer to her true self through her transformations. Of necessity, her sense of self is based not on her outward form, but on her soul, which is truly the only constant about her. It is the inner strength of that soul that enables her to take on any shape and remain herself within. The path of the master of many forms is ideal for a spellcaster of any race who has experienced shapechanging and yearns for more of it. Such a character can be a great force for either good or ill in the world. An evil master of many forms in particular poses a terrible threat, for she can appear anywhere, in any body. The same opponents may face her again and again, in one shape after another, never realizing that they are actually facing a single enemy.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "medium",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: [
    "Climb",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Disguise",
    "Handle Animal",
    "Hide",
    "Jump",
    "Knowledge (Nature)",
    "Listen",
    "Spot",
    "Survival",
    "Swim",
  ],
  requirements: [
    eq("feats.alertness.possessed"),
    eq("feats.endurance.possessed"),
    eq("feats.wildshape.*.possessed"),
  ],
  classFeatureAptitude: "Master of Many Forms Class Feature",
  classFeatures: [
    [1, "Improved Wild Shape (Humanoid) (Master of Many Forms)"],
    [1, "Shifter's Speech (Master of Many Forms)"],
    [1, "Weapon and Armor Proficiency (Master of Many Forms)"],
    [2, "Improved Wild Shape (Giant; Large) (Master of Many Forms)"],
    [3, "Fast Wild Shape (Master of Many Forms)"],
    [3, "Improved Wild Shape (Monstrous Humanoid) (Master of Many Forms)"],
    [4, "Improved Wild Shape (Fey; Tiny) (Master of Many Forms)"],
    [5, "Improved Wild Shape (Vermin) (Master of Many Forms)"],
    [6, "Improved Wild Shape (Aberration; Huge) (Master of Many Forms)"],
    [7, "Extraordinary Wild Shape (Master of Many Forms)"],
    [7, "Improved Wild Shape (Master of Many Forms)"],
    [8, "Improved Wild Shape (Master of Many Forms)"],
    [8, "Improved Wild Shape (Ooze; Diminutive) (Master of Many Forms)"],
    [9, "Improved Wild Shape (Master of Many Forms)"],
    [10, "Evershifting Form (Master of Many Forms)"],
    [10, "Improved Wild Shape (Dragon; Gargantuan) (Master of Many Forms)"],
    [10, "Improved Wild Shape (Master of Many Forms)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
