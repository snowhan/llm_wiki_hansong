/**
 * RED phase tests for ui-store.ts.
 *
 * These tests verify that UI-specific preferences (colorScheme, activeView,
 * chatExpanded) are extracted into a dedicated `useUiStore`, separate from
 * the server-derived config in wiki-store.
 *
 * All tests FAIL initially (RED) because ui-store.ts does not exist yet.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { useUiStore } from "../ui-store"

beforeEach(() => {
  useUiStore.setState({
    colorScheme: "system",
    activeView: "wiki",
    chatExpanded: false,
  })
})

describe("useUiStore", () => {
  describe("F-01: initial state", () => {
    it("defaults to colorScheme=system", () => {
      expect(useUiStore.getState().colorScheme).toBe("system")
    })

    it("defaults to activeView=wiki", () => {
      expect(useUiStore.getState().activeView).toBe("wiki")
    })

    it("defaults chatExpanded to false", () => {
      expect(useUiStore.getState().chatExpanded).toBe(false)
    })
  })

  describe("F-02: setColorScheme", () => {
    it("updates colorScheme to light", () => {
      useUiStore.getState().setColorScheme("light")
      expect(useUiStore.getState().colorScheme).toBe("light")
    })

    it("updates colorScheme to dark", () => {
      useUiStore.getState().setColorScheme("dark")
      expect(useUiStore.getState().colorScheme).toBe("dark")
    })
  })

  describe("F-03: setActiveView", () => {
    it("updates activeView to settings", () => {
      useUiStore.getState().setActiveView("settings")
      expect(useUiStore.getState().activeView).toBe("settings")
    })
  })

  describe("F-04: setChatExpanded", () => {
    it("toggles chatExpanded to true", () => {
      useUiStore.getState().setChatExpanded(true)
      expect(useUiStore.getState().chatExpanded).toBe(true)
    })
  })
})
