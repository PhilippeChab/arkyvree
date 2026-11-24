import { describe, expect, test } from "bun:test";

import { TooManyRequestsError } from "@/server/errors/index.ts";
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
    const queue = new UploadQueue({ limit: 2, maxWaitMs: 60_000, perOwner: 5 });
    const started: string[] = [];
    const [a, b, c, d] = ["a", "b", "c", "d"].map((name) => uploadOf(name, started));
    const runs = [a!, b!, c!, d!].map((upload, i) => queue.run(`user ${i}`, upload.run));
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

  test("refuses an owner past their uploads at once, and one that waited too long, its place given up", async () => {
    const queue = new UploadQueue({ limit: 1, maxWaitMs: 20, perOwner: 2 });
    const started: string[] = [];
    const [first, second, third] = ["first", "second", "third"].map((name) => uploadOf(name, started));
    const running = queue.run("gm", first!.run);
    const waiting = queue.run("gm", second!.run);
    // Their third, while two run or wait; another user's still waits its turn
    expect(queue.run("gm", third!.run)).rejects.toEqual(
      new TooManyRequestsError("You're uploading 2 files already: wait for one to finish"),
    );
    expect(waiting).rejects.toEqual(
      new TooManyRequestsError("The server is busy with other uploads: try again in a moment"),
    );
    await Bun.sleep(40);
    expect(queue.counts).toEqual({ running: 1, waiting: 0 });

    // Its place given up, the next one runs once the first is done, and the owner may upload again
    first!.finish();
    expect(await running).toBe("first");
    const again = uploadOf("again", started);
    const next = queue.run("gm", again.run);
    again.finish();
    expect(await next).toBe("again");
    expect(started).toEqual(["first", "again"]);
    expect(queue.counts).toEqual({ running: 0, waiting: 0 });
  });
});
