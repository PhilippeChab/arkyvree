/**
 * Part 2 of 3 of the sibling copies' sweeps: every winner's and every class's copy of a fork of every extension, a third
 * each (`partOf`), in files of their own so shards and workers run the parts alongside each other.
 */

import { expect, test } from "bun:test";

import {
  compareCopies,
  findKlassIds,
  findSiblingWinnerIds,
  findStaleClassCopies,
  partOf,
} from "@/tests/support/dnd3.5/siblingCopies.ts";
import { createSeededTestRulesetWithExtensions } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

test("a sibling winner's copy holds what the view showed of it, for a third of the winners of a fork of every extension", async () => {
  const fork = await createSeededTestRulesetWithExtensions(makeSession().userId);
  const { compared, mismatches } = await compareCopies(fork, partOf(await findSiblingWinnerIds(fork), 2, 3));
  expect(compared).toBeGreaterThan(100 / 3);
  expect(mismatches).toEqual([]);
}, 600_000);

test("a copied class's levels store the lists that stand for their granted feats' and spells' lists, for a third of the classes", async () => {
  const fork = await createSeededTestRulesetWithExtensions(makeSession().userId);
  const klassIds = partOf(await findKlassIds(fork), 2, 3);
  expect(klassIds.length).toBeGreaterThan(50 / 3);
  expect(await findStaleClassCopies(fork, klassIds)).toEqual([]);
}, 600_000);
