import { describe, expect, test } from "bun:test";

import { UploadQueue } from "@/server/storage/UploadQueue.ts";

/** An upload a test finishes when it chooses (`finish`, or `fail`), and the order uploads started in (`started`). */
function uploadOf(name: string, started: string[]) {
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const done = new Promise<string>((resolve, reject) => {
    finish = () => resolve(name);
    fail = reject;
  });
  return {
    finish,
    fail,
    run: () => {
      started.push(name);
      return done;
    },
  };
}

describe("UploadQueue", () => {
  test("stores as many uploads at once as it allows, the others waiting their turn in order", async () => {
    const queue = new UploadQueue(2);
    const started: string[] = [];
    const [a, b, c, d] = ["a", "b", "c", "d"].map((name) => uploadOf(name, started));
    const runs = [a!, b!, c!, d!].map((upload) => queue.run(upload.run));
    await Bun.sleep(0);
    expect(started).toEqual(["a", "b"]);
    expect(queue.counts).toEqual({ running: 2, waiting: 2 });

    // A refused upload hands its turn on too
    a!.fail(new Error("refused"));
    expect(runs[0]).rejects.toThrow("refused");
    await Bun.sleep(0);
    expect(started).toEqual(["a", "b", "c"]);
    b!.finish();
    c!.finish();
    await Bun.sleep(0);
    expect(started).toEqual(["a", "b", "c", "d"]);
    d!.finish();
    expect(await Promise.all(runs.slice(1))).toEqual(["b", "c", "d"]);
    expect(queue.counts).toEqual({ running: 0, waiting: 0 });
  });
});
