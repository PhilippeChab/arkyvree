/**
 * Lets `limit` uploads be stored at once on this server, the others waiting their turn, first come first served. Each
 * holds a part of its file in memory as it's stored (`ObjectStorage`), so the uploads at once bound what they hold
 * together; one waiting holds nothing, its body not yet read.
 */
export class UploadQueue {
  constructor(private readonly limit: number) {}
  private readonly waiting: (() => void)[] = [];

  private running = 0;

  /** How many uploads are being stored, and how many wait their turn. */
  get counts() {
    return { running: this.running, waiting: this.waiting.length };
  }

  /** Runs an upload (`upload`) once a turn is free, and hands its turn on once it's done, stored or refused. */
  async run<T>(upload: () => Promise<T>): Promise<T> {
    if (this.running < this.limit) this.running += 1;
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    try {
      return await upload();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }
}
