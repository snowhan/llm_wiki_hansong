/**
 * Ingest concurrency queue using the Semaphore pattern.
 * Limits the number of simultaneously running ingest tasks to prevent
 * resource exhaustion when multiple sources are ingested concurrently.
 *
 * Usage:
 *   const queue = new IngestQueue(2)  // max 2 concurrent tasks
 *   await queue.run(async () => { ... })
 */

export class IngestQueue {
  private readonly maxConcurrent: number
  private active = 0
  private readonly pending: Array<{
    fn: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (reason?: unknown) => void
  }> = []

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent
  }

  /**
   * Run `fn` when a concurrency slot is available.
   * Returns a promise that resolves/rejects with the fn's result.
   */
  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject })
      this.drain()
    })
  }

  /**
   * Cancel all pending (not yet started) tasks with the given error message.
   * Already running tasks are not affected.
   */
  cancel(reason: string): void {
    while (this.pending.length > 0) {
      const item = this.pending.pop()
      if (item) item.reject(new Error(reason))
    }
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.pending.length > 0) {
      const item = this.pending.shift()
      if (!item) break
      this.active++
      item.fn()
        .then((result) => {
          item.resolve(result)
        })
        .catch((err) => {
          item.reject(err)
        })
        .finally(() => {
          this.active--
          this.drain()
        })
    }
  }
}

/**
 * Singleton ingest queue shared across all ingest tasks.
 * Default concurrency: 2 simultaneous ingest tasks.
 */
export const ingestQueue = new IngestQueue(2)
