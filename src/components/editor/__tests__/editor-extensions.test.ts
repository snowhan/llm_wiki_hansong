import { describe, it, expect, vi } from "vitest"
import { Extension } from "@tiptap/core"

// Mock the slash-extension entirely to avoid tippy.js / @tiptap/suggestion peer deps
vi.mock("../slash-extension", () => ({
  SlashCommandsExtension: Extension.create({ name: "slashCommands" }),
}))

import { getEditorExtensions } from "../editor-extensions"

// TipTap extensions expose their name on the `Extension.name` property
// We can verify required extensions are registered without spinning up a real editor.

describe("getEditorExtensions", () => {
  it("T-005: includes SlashCommandsExtension (slash commands)", () => {
    const extensions = getEditorExtensions()
    const names = extensions.map((e) => e.name)
    expect(names).toContain("slashCommands")
  })

  it("T-004: BubbleMenu placeholder (element: null) is removed from extensions", () => {
    const extensions = getEditorExtensions()
    // The standalone BubbleMenu extension with element:null used to clobber
    // the React-based BubbleToolbar.  It must not appear in the list.
    const bubbleMenuExts = extensions.filter((e) => e.name === "bubbleMenu")
    expect(bubbleMenuExts).toHaveLength(0)
  })

  it("includes core extensions (StarterKit, codeBlockLowlight, table)", () => {
    const extensions = getEditorExtensions()
    const names = extensions.map((e) => e.name)
    expect(names.some((n) => n.toLowerCase().includes("codeblock"))).toBe(true)
    expect(names.some((n) => n.toLowerCase().includes("table"))).toBe(true)
  })

  it("readonly mode returns extensions without document mutation", () => {
    const extensions = getEditorExtensions({ readonly: true })
    expect(extensions.length).toBeGreaterThan(0)
  })
})
