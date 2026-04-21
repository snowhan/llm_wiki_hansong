import { describe, it, expect, vi, beforeEach } from "vitest"
import { ShortcutRegistry } from "../keyboard-shortcuts"

describe("ShortcutRegistry", () => {
  let registry: ShortcutRegistry

  beforeEach(() => {
    registry = new ShortcutRegistry()
  })

  it("registers and fires a shortcut", () => {
    const handler = vi.fn()
    registry.register({ key: "k", meta: true }, handler)

    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    registry.handleKeyDown(event)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("does not fire when modifier mismatch", () => {
    const handler = vi.fn()
    registry.register({ key: "k", meta: true }, handler)

    const event = new KeyboardEvent("keydown", { key: "k", metaKey: false, bubbles: true })
    registry.handleKeyDown(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it("fires ctrl as alternative to meta on non-mac", () => {
    const handler = vi.fn()
    registry.register({ key: "k", meta: true }, handler)

    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
    registry.handleKeyDown(event)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("unregisters a shortcut", () => {
    const handler = vi.fn()
    const unregister = registry.register({ key: "k", meta: true }, handler)
    unregister()

    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    registry.handleKeyDown(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it("returns all registered shortcuts for overlay", () => {
    registry.register({ key: "k", meta: true, label: "Command Palette" }, vi.fn())
    registry.register({ key: "p", meta: true, label: "Fuzzy Find" }, vi.fn())

    const all = registry.getAll()
    expect(all).toHaveLength(2)
    expect(all[0].label).toBe("Command Palette")
  })

  it("handles multiple shortcuts independently", () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    registry.register({ key: "k", meta: true }, h1)
    registry.register({ key: "p", meta: true }, h2)

    registry.handleKeyDown(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).not.toHaveBeenCalled()
  })
})
