/**
 * TDD RED phase — ingest-queue.ts
 *
 * Tests for concurrency control (Semaphore pattern).
 *   D-01: queue respects concurrency limit (≤ maxConcurrent active at once)
 *   D-02: queued tasks run after active slots are freed
 *   D-03: cancel() skips pending tasks that haven't started
 *   D-04: queue continues processing after one task completes
 */

import { describe, it, expect, vi } from "vitest"

const { IngestQueue } = await import("../ingest-queue.js")

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe("IngestQueue", () => {
  describe("D-01: respects concurrency limit", () => {
    it("runs at most maxConcurrent tasks simultaneously", async () => {
      const queue = new IngestQueue(2)
      let concurrent = 0
      let maxConcurrent = 0

      const task = async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await delay(20)
        concurrent--
      }

      await Promise.all([
        queue.run(task),
        queue.run(task),
        queue.run(task),
        queue.run(task),
      ])

      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })
  })

  describe("D-02: queued tasks run after active tasks complete", () => {
    it("eventually runs all enqueued tasks", async () => {
      const queue = new IngestQueue(1)
      const order: number[] = []

      await Promise.all([
        queue.run(async () => { await delay(10); order.push(1) }),
        queue.run(async () => { await delay(5); order.push(2) }),
        queue.run(async () => { order.push(3) }),
      ])

      expect(order).toEqual([1, 2, 3])
    })
  })

  describe("D-03: cancel() skips pending tasks", () => {
    it("pending tasks receive a cancellation error", async () => {
      const queue = new IngestQueue(1)
      const longTask = async () => {
        await delay(200)
        return "done"
      }

      // Start first task (occupies the slot)
      const p1 = queue.run(longTask)

      // Enqueue a second task (will be queued, not running yet)
      // Immediately attach a catch handler to prevent unhandled rejection warning
      let p2Error: Error | null = null
      const p2 = queue.run(async () => "should be cancelled")
      p2.catch((err: Error) => { p2Error = err })

      // Cancel pending tasks
      queue.cancel("cancelled")

      await p1
      // Give microtask queue a chance to process the rejection
      await delay(0)

      expect(p2Error?.message).toBe("cancelled")
    })
  })

  describe("D-04: continues after one task completes", () => {
    it("subsequent tasks run after earlier tasks complete", async () => {
      const queue = new IngestQueue(1)
      const results: string[] = []

      await queue.run(async () => { results.push("first"); return "first" })
      await queue.run(async () => { results.push("second"); return "second" })

      expect(results).toEqual(["first", "second"])
    })
  })
})
