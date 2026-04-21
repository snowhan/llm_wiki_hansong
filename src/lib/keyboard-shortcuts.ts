export interface ShortcutDef {
  key: string
  meta?: boolean      // ⌘ on Mac, Ctrl on Windows/Linux
  ctrl?: boolean      // explicit Ctrl only
  shift?: boolean
  alt?: boolean
  label?: string
  description?: string
}

type ShortcutHandler = (event: KeyboardEvent) => void

interface RegisteredShortcut {
  def: ShortcutDef
  handler: ShortcutHandler
}

function shortcutKey(def: ShortcutDef): string {
  const parts: string[] = []
  if (def.meta) parts.push("meta")
  if (def.ctrl) parts.push("ctrl")
  if (def.shift) parts.push("shift")
  if (def.alt) parts.push("alt")
  parts.push(def.key.toLowerCase())
  return parts.join("+")
}

function eventKey(e: KeyboardEvent, treatCtrlAsMeta = true): string[] {
  const keys: string[] = []
  // A key bound to "meta" fires on both metaKey AND ctrlKey (cross-platform)
  const metaActive = e.metaKey || (treatCtrlAsMeta && e.ctrlKey)
  if (metaActive) keys.push("meta")
  if (e.ctrlKey && !treatCtrlAsMeta) keys.push("ctrl")
  if (e.shiftKey) keys.push("shift")
  if (e.altKey) keys.push("alt")
  keys.push(e.key.toLowerCase())
  return [keys.join("+")]
}

/** Singleton-friendly, testable shortcut registry. */
export class ShortcutRegistry {
  private readonly shortcuts: RegisteredShortcut[] = []

  /** Register a shortcut. Returns an unregister function. */
  register(def: ShortcutDef, handler: ShortcutHandler): () => void {
    const entry: RegisteredShortcut = { def, handler }
    this.shortcuts.push(entry)
    return () => {
      const idx = this.shortcuts.indexOf(entry)
      if (idx !== -1) this.shortcuts.splice(idx, 1)
    }
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    const pressed = eventKey(event)
    for (const { def, handler } of this.shortcuts) {
      const candidate = shortcutKey(def)
      if (pressed.includes(candidate)) {
        handler(event)
        return true
      }
    }
    return false
  }

  getAll(): Array<{ def: ShortcutDef; label: string }> {
    return this.shortcuts.map(({ def }) => ({
      def,
      label: def.label ?? def.key,
    }))
  }
}

/** Global registry — use this in components via the `useGlobalShortcut` hook. */
export const globalShortcuts = new ShortcutRegistry()
