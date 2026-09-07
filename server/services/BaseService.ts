import { InternalError } from "@/server/errors/index.ts";
import { type Result, safePromisify } from "@/shared/utils.ts";

type Method = (...args: never[]) => unknown;
export type Methods = Record<string, Method>;

abstract class BaseService<M extends Methods> {
  _methods: M;
  constructor(methods: M) {
    this._methods = methods;
  }

  async call<T extends keyof M>(
    name: T,
    ...args: Parameters<M[T]>
  ): Promise<Result<Awaited<ReturnType<M[T]>>>> {
    return (await safePromisify(async () => {
      if (!this._methods[name]) {
        throw new InternalError(`Invalid service method ${name.toString()}.`);
      }

      return await this._methods[name](...args);
    })) as Result<Awaited<ReturnType<M[T]>>>;
  }
}

export default BaseService;
