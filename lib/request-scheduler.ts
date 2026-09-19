export class UpstreamError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export class RequestScheduler {
  private queue: Array<{
    task: () => Promise<unknown>;
    resolve: (v: unknown) => void;
    reject: (error: unknown) => void;
    queued: number;
    priority: number;
    sequence: number;
  }> = [];
  private sequence = 0;
  private starts: number[] = [];
  private running = false;
  private cooldown = 0;
  constructor(
    private now = Date.now,
    private sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  defer(ms: number) {
    this.cooldown = Math.max(this.cooldown, this.now() + Math.min(30000, ms));
  }
  run<T>(task: () => Promise<T>, priority = 0): Promise<T> {
    if (this.queue.length >= 24)
      return Promise.reject(
        new UpstreamError("Data queue busy; retry shortly", 503),
      );
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task,
        resolve: resolve as (v: unknown) => void,
        reject,
        queued: this.now(),
        priority,
        sequence: this.sequence++,
      });
      this.queue.sort(
        (a, b) =>
          b.priority - a.priority ||
          (a.priority > 0 ? b.sequence - a.sequence : a.sequence - b.sequence),
      );
      void this.drain();
    });
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift()!;
        try {
          this.starts = this.starts.filter((t) => this.now() - t < 60000);
          const last = this.starts.at(-1) ?? -Infinity;
          const delay = Math.max(
            0,
            last + 400 - this.now(),
            this.starts.length >= 30 ? this.starts[0] + 60000 - this.now() : 0,
            this.cooldown - this.now(),
          );
          if (this.now() + delay - item.queued > 90000)
            throw new UpstreamError("Data queue deadline exceeded", 503);
          if (delay) await this.sleep(delay);
          this.starts.push(this.now());
          item.resolve(await item.task());
        } catch (error) {
          item.reject(error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
