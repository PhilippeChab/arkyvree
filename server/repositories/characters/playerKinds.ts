import { Engine } from "@/engine/index.ts";

/**
 * Every module's player character's kind (`StoredCharacter.playerKind`): the characters a user lists, shares and links
 * to a campaign; a character of another kind is another's child (3.5's bonded creatures), which follows its parent.
 */
export const PLAYER_KINDS: readonly string[] = Engine.storage().playerKinds();
