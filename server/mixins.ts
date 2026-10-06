/**
 * Ruby's `include` for classes: `class X extends include(Base, A, B)` gives X the methods of the modules A and B. A
 * module is a mixin, a function from a class to a class extending it (`export function A<B extends Constructor<…>>(
 * Base: B) { abstract class … extends Base { … } }`). It adds methods, never state, and may use what its base has
 * (a repository's `table`). Each module keeps one concern out of the class that includes it.
 */

type Module<B extends Constructor, R extends Constructor> = (Base: B) => R;

/** A class a mixin extends: TypeScript requires its constructor to take `any[]` (TS2545). */
export type Constructor<I = object> = abstract new (...args: any[]) => I;

export function include<B extends Constructor, M1 extends Constructor>(base: B, m1: Module<B, M1>): M1 & B;
export function include<B extends Constructor, M1 extends Constructor, M2 extends Constructor>(
  base: B,
  m1: Module<B, M1>,
  m2: Module<M1 & B, M2>,
): M2 & M1 & B;
export function include<B extends Constructor, M1 extends Constructor, M2 extends Constructor, M3 extends Constructor>(
  base: B,
  m1: Module<B, M1>,
  m2: Module<M1 & B, M2>,
  m3: Module<M2 & M1 & B, M3>,
): M3 & M2 & M1 & B;
export function include<
  B extends Constructor,
  M1 extends Constructor,
  M2 extends Constructor,
  M3 extends Constructor,
  M4 extends Constructor,
>(
  base: B,
  m1: Module<B, M1>,
  m2: Module<M1 & B, M2>,
  m3: Module<M2 & M1 & B, M3>,
  m4: Module<M3 & M2 & M1 & B, M4>,
): M4 & M3 & M2 & M1 & B;
export function include<
  B extends Constructor,
  M1 extends Constructor,
  M2 extends Constructor,
  M3 extends Constructor,
  M4 extends Constructor,
  M5 extends Constructor,
>(
  base: B,
  m1: Module<B, M1>,
  m2: Module<M1 & B, M2>,
  m3: Module<M2 & M1 & B, M3>,
  m4: Module<M3 & M2 & M1 & B, M4>,
  m5: Module<M4 & M3 & M2 & M1 & B, M5>,
): M5 & M4 & M3 & M2 & M1 & B;
export function include<
  B extends Constructor,
  M1 extends Constructor,
  M2 extends Constructor,
  M3 extends Constructor,
  M4 extends Constructor,
  M5 extends Constructor,
  M6 extends Constructor,
>(
  base: B,
  m1: Module<B, M1>,
  m2: Module<M1 & B, M2>,
  m3: Module<M2 & M1 & B, M3>,
  m4: Module<M3 & M2 & M1 & B, M4>,
  m5: Module<M4 & M3 & M2 & M1 & B, M5>,
  m6: Module<M5 & M4 & M3 & M2 & M1 & B, M6>,
): M6 & M5 & M4 & M3 & M2 & M1 & B;
export function include<
  B extends Constructor,
  M1 extends Constructor,
  M2 extends Constructor,
  M3 extends Constructor,
  M4 extends Constructor,
  M5 extends Constructor,
  M6 extends Constructor,
  M7 extends Constructor,
>(
  base: B,
  m1: Module<B, M1>,
  m2: Module<M1 & B, M2>,
  m3: Module<M2 & M1 & B, M3>,
  m4: Module<M3 & M2 & M1 & B, M4>,
  m5: Module<M4 & M3 & M2 & M1 & B, M5>,
  m6: Module<M5 & M4 & M3 & M2 & M1 & B, M6>,
  m7: Module<M6 & M5 & M4 & M3 & M2 & M1 & B, M7>,
): M7 & M6 & M5 & M4 & M3 & M2 & M1 & B;
export function include<
  B extends Constructor,
  M1 extends Constructor,
  M2 extends Constructor,
  M3 extends Constructor,
  M4 extends Constructor,
  M5 extends Constructor,
  M6 extends Constructor,
  M7 extends Constructor,
  M8 extends Constructor,
>(
  base: B,
  m1: Module<B, M1>,
  m2: Module<M1 & B, M2>,
  m3: Module<M2 & M1 & B, M3>,
  m4: Module<M3 & M2 & M1 & B, M4>,
  m5: Module<M4 & M3 & M2 & M1 & B, M5>,
  m6: Module<M5 & M4 & M3 & M2 & M1 & B, M6>,
  m7: Module<M6 & M5 & M4 & M3 & M2 & M1 & B, M7>,
  m8: Module<M7 & M6 & M5 & M4 & M3 & M2 & M1 & B, M8>,
): M8 & M7 & M6 & M5 & M4 & M3 & M2 & M1 & B;
export function include<
  B extends Constructor,
  M1 extends Constructor,
  M2 extends Constructor,
  M3 extends Constructor,
  M4 extends Constructor,
  M5 extends Constructor,
  M6 extends Constructor,
  M7 extends Constructor,
  M8 extends Constructor,
  M9 extends Constructor,
>(
  base: B,
  m1: Module<B, M1>,
  m2: Module<M1 & B, M2>,
  m3: Module<M2 & M1 & B, M3>,
  m4: Module<M3 & M2 & M1 & B, M4>,
  m5: Module<M4 & M3 & M2 & M1 & B, M5>,
  m6: Module<M5 & M4 & M3 & M2 & M1 & B, M6>,
  m7: Module<M6 & M5 & M4 & M3 & M2 & M1 & B, M7>,
  m8: Module<M7 & M6 & M5 & M4 & M3 & M2 & M1 & B, M8>,
  m9: Module<M8 & M7 & M6 & M5 & M4 & M3 & M2 & M1 & B, M9>,
): M9 & M8 & M7 & M6 & M5 & M4 & M3 & M2 & M1 & B;
export function include(base: Constructor, ...modules: Module<Constructor, Constructor>[]): Constructor {
  return modules.reduce((included, module) => module(included), base);
}
