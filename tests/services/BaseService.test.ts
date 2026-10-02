import { describe, expect, test } from "bun:test";

import { InternalError, NotFoundError } from "@/server/errors/index.ts";
import BaseService from "@/server/services/BaseService.ts";

const methods = {
  double: async (n: number) => n * 2,
  // A method can call another through `this`, its object
  quadruple(n: number) {
    return this.double(n * 2);
  },
  missing: async () => {
    throw new NotFoundError("Nothing here");
  },
  throwsText: () => {
    // oxlint-disable-next-line no-throw-literal -- what a careless dependency could throw
    throw "boom";
  },
};
class TestService extends BaseService<typeof methods> {}
const service = new TestService(methods);

describe("A service call", () => {
  test("gives the method's value", async () => {
    expect(await service.call("double", 21)).toEqual([true, 42, undefined]);
    expect(await service.call("quadruple", 5)).toEqual([true, 20, undefined]);
  });

  test("gives the error it threw, made an Error when it wasn't one", async () => {
    expect(await service.call("missing")).toEqual([false, undefined, new NotFoundError("Nothing here")]);
    const [ok, , error] = await service.call("throwsText");
    expect(ok).toBe(false);
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("boom");
  });

  test("refuses a method the service doesn't have", async () => {
    // @ts-expect-error -- not one of its methods
    const [ok, , error] = await service.call("nope");
    expect(ok).toBe(false);
    expect(error).toEqual(new InternalError("Invalid service method nope."));
  });
});
