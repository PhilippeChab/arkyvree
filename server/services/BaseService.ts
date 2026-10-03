import { InternalError } from "@/server/errors/index.ts";

/** A service call's outcome: `[true, value, undefined]`, or `[false, undefined, error]` when it threw. */
export type Result<N> = [true, N, undefined] | [false, undefined, Error];

type Method = (...args: never[]) => unknown;
export type Methods = Record<string, Method>;

abstract class BaseService<M extends Methods> {
  _methods: M;
  constructor(methods: M) {
    this._methods = methods;
  }

  async call<T extends keyof M>(name: T, ...args: Parameters<M[T]>): Promise<Result<Awaited<ReturnType<M[T]>>>> {
    try {
      if (!this._methods[name]) throw new InternalError(`Invalid service method ${name.toString()}.`);
      // Called on its object, which a method can use as `this`; TypeScript can't follow the generic call's return type
      return [true, (await this._methods[name](...args)) as Awaited<ReturnType<M[T]>>, undefined];
    } catch (error) {
      return [false, undefined, error instanceof Error ? error : new Error(String(error))];
    }
  }
}

export default BaseService;
