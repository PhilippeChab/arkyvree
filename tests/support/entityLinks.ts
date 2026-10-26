/** An entity's links as an answer carries them: a page's or a list's, each its role and the entity it's to. */

import type { NamedLink } from "@/engine/core/view/index.ts";

/** The entity an answer's link of a role names (`role`, among its `links`): none without one. */
export function linkedId(entity: object | undefined, role: string): string | undefined {
  return linksOf(entity, role)[0]?.toId;
}

/** An answer's links of a role (`role`, among its `links`), in their order: none without any. */
export function linksOf(entity: object | undefined, role: string): NamedLink[] {
  const links = entity && "links" in entity && Array.isArray(entity.links) ? (entity.links as NamedLink[]) : [];
  return links.filter((link) => link.role === role);
}
