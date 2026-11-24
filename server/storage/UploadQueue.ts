import { TooManyRequestsError } from "@/server/errors/index.ts";

/**
 * Lets `limit` uploads be stored at once on this server, the others waiting their turn, first come first served, for
 * `maxWaitMs` at most. Each holds a part of its file in memory as it's stored (`ObjectStorage`), so the uploads at once
 * bound what they hold together; one waiting holds nothing, its body not yet read. An owner (a user) holds
 * `perOwner` uploads at most, running or waiting, so none takes every turn.
 */
export class UploadQueue {
  constructor(private readonly options: { limit: number; maxWaitMs: number; perOwner: number }) {}
  private readonly owners = new Map<string, number>();
  private readonly waiting: (() => void)[] = [];

  private running = 0;

  /** Hands a finished upload's turn to the first waiting, or frees it. */
  private handOn() {
    const next = this.waiting.shift();
    if (next) next();
    else this.running -= 1;
  }

  /** Waits for a turn, refused once it has waited `maxWaitMs`: the server's too busy, and its client tries again. */
  private async waitTurn() {
    if (this.running < this.options.limit) {
      this.running += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const turn = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(turn), 1);
        reject(new TooManyRequestsError("The server is busy with other uploads: try again in a moment"));
      }, this.options.maxWaitMs);
      this.waiting.push(turn);
    });
  }

  /** How many uploads are being stored, and how many wait their turn. */
  get counts() {
    return { running: this.running, waiting: this.waiting.length };
  }

  /**
   * Runs an owner's upload (`upload`, `owner`'s) once a turn is free, and hands its turn on once it's done, stored or
   * refused. An owner already holding `perOwner` uploads is refused.
   */
  async run<T>(owner: string, upload: () => Promise<T>): Promise<T> {
    const held = this.owners.get(owner) ?? 0;
    if (held >= this.options.perOwner)
      throw new TooManyRequestsError(`You're uploading ${held} files already: wait for one to finish`);
    this.owners.set(owner, held + 1);
    try {
      await this.waitTurn();
      try {
        return await upload();
      } finally {
        this.handOn();
      }
    } finally {
      const left = (this.owners.get(owner) ?? 1) - 1;
      if (left > 0) this.owners.set(owner, left);
      else this.owners.delete(owner);
    }
  }
}
