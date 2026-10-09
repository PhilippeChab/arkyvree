import { BONDED_KINDS, type BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";

/** The kinds a 3.5 race or class is for: a player character, or a creature bonded to one (`BONDED_KINDS`). */
export const DND35_ENTITY_KINDS: { label: string; value: "pc" | BondedKind }[] = [
  { value: "pc", label: "Player Character" },
  ...BONDED_KINDS.map((kind) => ({ value: kind.slug, label: kind.label })),
];
